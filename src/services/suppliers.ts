import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  orders,
  productVariants,
  supplierProducts,
  suppliers,
  supplierTransactions,
} from '../db/schema.ts';
import { decryptSecret } from '../lib/crypto.ts';

function buildAuthHeaders(authType: string, apiKey: string, apiSecret?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (authType === 'x_api_key') {
    headers['X-API-Key'] = apiKey;
    if (apiSecret) headers['X-API-Secret'] = apiSecret;
  } else if (authType === 'basic') {
    const token = Buffer.from(`${apiKey}:${apiSecret || ''}`).toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

export async function testSupplierConnection(supplierId: number): Promise<{
  ok: boolean;
  statusCode?: number;
  message: string;
}> {
  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  const supplier = rows[0];
  if (!supplier) {
    return { ok: false, message: 'Fournisseur introuvable' };
  }

  const apiKey = decryptSecret(supplier.encryptedApiKey);
  const apiSecret = supplier.encryptedApiSecret ? decryptSecret(supplier.encryptedApiSecret) : undefined;
  const headers = buildAuthHeaders(supplier.authType, apiKey, apiSecret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(supplier.apiUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const ok = resp.ok;
    const msg = ok
      ? `Connexion HTTP ${resp.status} réussie`
      : `Le fournisseur a répondu avec le statut HTTP ${resp.status}`;

    await db
      .update(suppliers)
      .set({
        lastTestStatus: ok ? 'success' : 'error',
        lastTestMessage: msg,
        lastTestedAt: new Date(),
      })
      .where(eq(suppliers.id, supplierId));

    return { ok, statusCode: resp.status, message: msg };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur réseau lors du test API';
    await db
      .update(suppliers)
      .set({
        lastTestStatus: 'error',
        lastTestMessage: msg,
        lastTestedAt: new Date(),
      })
      .where(eq(suppliers.id, supplierId));

    return { ok: false, message: msg };
  }
}

export async function syncSupplierCatalog(supplierId: number): Promise<{
  ok: boolean;
  importedCount: number;
  message: string;
}> {
  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  const supplier = rows[0];
  if (!supplier) {
    return { ok: false, importedCount: 0, message: 'Fournisseur introuvable' };
  }

  const apiKey = decryptSecret(supplier.encryptedApiKey);
  const apiSecret = supplier.encryptedApiSecret ? decryptSecret(supplier.encryptedApiSecret) : undefined;
  const headers = buildAuthHeaders(supplier.authType, apiKey, apiSecret);

  const baseUrl = supplier.apiUrl.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/products`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(endpoint, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      return {
        ok: false,
        importedCount: 0,
        message: `Échec synchronisation catalogue: HTTP ${resp.status} depuis ${endpoint}`,
      };
    }

    const data = (await resp.json()) as unknown;
    const list = Array.isArray(data)
      ? data
      : Array.isArray((data as { products?: unknown[] })?.products)
      ? (data as { products: unknown[] }).products
      : [];

    let importedCount = 0;
    for (const raw of list) {
      const item = raw as Record<string, unknown>;
      const sku = String(item.sku || item.id || '').trim();
      const name = String(item.name || item.title || '').trim();
      const priceNum = Number(item.price ?? item.unitPrice ?? 0);
      if (!sku || !name || !Number.isFinite(priceNum) || priceNum <= 0) continue;

      await db.insert(supplierProducts).values({
        supplierId: supplier.id,
        externalSku: sku,
        externalName: name,
        regionCode: String(item.region || 'US'),
        supplierPriceUsd: priceNum.toFixed(2),
        supplierStock: Number(item.stock ?? 0),
        supportsDlsPlayerId: Boolean(item.supportsDlsPlayerId),
        lastSyncedAt: new Date(),
      });
      importedCount++;
    }

    return {
      ok: true,
      importedCount,
      message: `${importedCount} produits synchronisés depuis ${supplier.name}`,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur réseau lors de la synchronisation';
    return { ok: false, importedCount: 0, message: msg };
  }
}

export async function checkDlsSupplierCompatibility(): Promise<{
  automatedAvailable: boolean;
  supplierName: string | null;
  deliveryMode: 'api_automated' | 'manual_admin';
}> {
  const activeSuppliers = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.isActive, true))
    .orderBy(asc(suppliers.priority));

  const dlsCapable = activeSuppliers.find((s) => s.supportsDls && s.lastTestStatus === 'success');
  if (dlsCapable) {
    return {
      automatedAvailable: true,
      supplierName: dlsCapable.name,
      deliveryMode: 'api_automated',
    };
  }
  return {
    automatedAvailable: false,
    supplierName: null,
    deliveryMode: 'manual_admin',
  };
}

export async function dispatchOrderToSupplier(orderId: number): Promise<{
  mode: 'api_sent' | 'manual_fallback';
  message: string;
}> {
  const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = orderRows[0];
  if (!order) {
    throw new Error('Commande introuvable');
  }

  const activeSuppliers = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.isActive, true))
    .orderBy(asc(suppliers.priority));

  if (activeSuppliers.length === 0) {
    await db.insert(supplierTransactions).values({
      orderId: order.id,
      status: 'manual_fallback',
      errorMessage: 'Aucun fournisseur API actif configuré — basculement en livraison manuelle par l’administration.',
      requestPayload: { orderRef: order.orderRef, playerId: order.playerId },
    });
    await db
      .update(orders)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    return {
      mode: 'manual_fallback',
      message: 'Paiement vérifié — commande en attente de livraison manuelle par l’équipe KAL-SU GIFT.',
    };
  }

  // Try primary then secondary supplier
  for (const supplier of activeSuppliers) {
    if (order.playerId && !supplier.supportsDls) {
      continue;
    }

    const mapped = await db
      .select()
      .from(supplierProducts)
      .where(eq(supplierProducts.supplierId, supplier.id))
      .limit(1);

    const apiKey = decryptSecret(supplier.encryptedApiKey);
    const apiSecret = supplier.encryptedApiSecret
      ? decryptSecret(supplier.encryptedApiSecret)
      : undefined;
    const headers = buildAuthHeaders(supplier.authType, apiKey, apiSecret);
    const baseUrl = supplier.apiUrl.replace(/\/+$/, '');
    const requestPayload = {
      orderRef: order.orderRef,
      playerId: order.playerId,
      externalSku: mapped[0]?.externalSku ?? null,
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseText = await resp.text();
      let responseJson: unknown = { raw: responseText };
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        // Keep raw text
      }

      if (resp.ok) {
        const extRef =
          typeof responseJson === 'object' && responseJson !== null
            ? String((responseJson as Record<string, unknown>).orderId || (responseJson as Record<string, unknown>).reference || '')
            : '';

        await db.insert(supplierTransactions).values({
          orderId: order.id,
          supplierId: supplier.id,
          externalOrderRef: extRef || null,
          requestPayload,
          responsePayload: responseJson,
          status: 'sent',
        });

        await db
          .update(orders)
          .set({ status: 'processing', updatedAt: new Date() })
          .where(eq(orders.id, order.id));

        return {
          mode: 'api_sent',
          message: `Commande transmise au fournisseur ${supplier.name}`,
        };
      }

      await db.insert(supplierTransactions).values({
        orderId: order.id,
        supplierId: supplier.id,
        requestPayload,
        responsePayload: responseJson,
        status: 'failed',
        errorMessage: `HTTP ${resp.status}`,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur réseau fournisseur';
      await db.insert(supplierTransactions).values({
        orderId: order.id,
        supplierId: supplier.id,
        requestPayload,
        status: 'failed',
        errorMessage: msg,
      });
    }
  }

  // Fallback to manual delivery when all suppliers fail or don't support DLS
  await db.insert(supplierTransactions).values({
    orderId: order.id,
    status: 'manual_fallback',
    errorMessage: 'Fournisseurs indisponibles ou incompatibles — livraison manuelle requise.',
    requestPayload: { orderRef: order.orderRef, playerId: order.playerId },
  });

  await db
    .update(orders)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  return {
    mode: 'manual_fallback',
    message: 'Transmis pour traitement manuel sécurisé par l’administration.',
  };
}

export async function syncVariantPricesFromSupplier(supplierId: number): Promise<number> {
  const mappings = await db
    .select()
    .from(supplierProducts)
    .where(eq(supplierProducts.supplierId, supplierId));

  let updated = 0;
  for (const map of mappings) {
    if (!map.productVariantId) continue;
    await db
      .update(productVariants)
      .set({
        supplierCostUsd: map.supplierPriceUsd,
        stockQuantity: map.supplierStock,
        stockStatus: map.supplierStock > 0 ? 'in_stock' : 'out_of_stock',
      })
      .where(eq(productVariants.id, map.productVariantId));
    updated++;
  }
  return updated;
}
