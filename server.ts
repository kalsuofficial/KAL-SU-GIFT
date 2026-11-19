import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  auditLogs,
  categories,
  coupons,
  exchangeRates,
  notifications,
  orderItems,
  orders,
  payments,
  products,
  productVariants,
  profiles,
  promotions,
  refunds,
  roles,
  supplierProducts,
  suppliers,
  supplierTransactions,
  supportTickets,
  systemSettings,
} from './src/db/schema.ts';
import { ensureSeeded, getCustomerRoleId } from './src/db/seed.ts';
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  maskSecret,
  signSessionToken,
  verifyPassword,
} from './src/lib/crypto.ts';
import {
  AuthRequest,
  optionalAuth,
  requireAuth,
  requirePermission,
} from './src/middleware/auth.ts';
import { dispatchNotification } from './src/services/notifications.ts';
import {
  checkDlsSupplierCompatibility,
  dispatchOrderToSupplier,
  syncSupplierCatalog,
  syncVariantPricesFromSupplier,
  testSupplierConnection,
} from './src/services/suppliers.ts';

const app = express();
app.use(express.json({ limit: '2mb' }));

// Ensure database is seeded before handling API routes
app.use('/api', async (_req, res, next) => {
  try {
    await ensureSeeded();
    next();
  } catch (error) {
    console.error('Database initialization error:', error);
    res.status(503).json({ error: 'Service temporairement indisponible. Réessayez.' });
  }
});

async function logAudit(
  actorId: number | null,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>,
  ip?: string
) {
  try {
    await db.insert(auditLogs).values({
      actorId,
      action,
      entityType,
      entityId,
      details,
      ipAddress: ip || null,
    });
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}

async function getCurrentExchangeRate(): Promise<number> {
  const rows = await db
    .select()
    .from(exchangeRates)
    .orderBy(desc(exchangeRates.createdAt))
    .limit(1);
  return rows[0] ? Number(rows[0].rate) : 132.5;
}

async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(systemSettings);
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

function safeDecryptSecret(val?: string | null): string {
  if (!val) return '';
  try {
    if (val.split(':').length === 3) {
      return decryptSecret(val);
    }
    return val;
  } catch {
    return '';
  }
}

async function upsertSetting(
  key: string,
  value: string,
  isSecret = false,
  description = 'Paramètre système KAL-SU GIFT'
) {
  await db
    .insert(systemSettings)
    .values({
      key,
      value,
      isSecret,
      description,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value,
        isSecret,
        updatedAt: new Date(),
      },
    });
}

function getPaymentGatewaysState(settingsMap: Record<string, string>) {
  const moncashEnv = settingsMap.moncash_env === 'production' ? 'production' : 'sandbox';
  const moncashMode = settingsMap.moncash_verification_mode === 'auto_api' ? 'auto_api' : 'manual';
  const moncashClientId =
    safeDecryptSecret(settingsMap.moncash_client_id) || process.env.MONCASH_CLIENT_ID || '';
  const moncashClientSecret =
    safeDecryptSecret(settingsMap.moncash_client_secret) || process.env.MONCASH_CLIENT_SECRET || '';
  const moncashWebhookSecret =
    safeDecryptSecret(settingsMap.moncash_webhook_secret) || process.env.PAYMENT_WEBHOOK_SECRET || '';
  const moncashApiConfigured = Boolean(moncashClientId && moncashClientSecret);

  const natcashEnv = settingsMap.natcash_env === 'production' ? 'production' : 'sandbox';
  const natcashMode = settingsMap.natcash_verification_mode === 'auto_api' ? 'auto_api' : 'manual';
  const natcashMerchantId =
    settingsMap.natcash_merchant_id || process.env.NATCASH_MERCHANT_ID || '';
  const natcashMerchantCode = settingsMap.natcash_merchant_code || '';
  const natcashApiKey =
    safeDecryptSecret(settingsMap.natcash_api_key) || process.env.NATCASH_API_KEY || '';
  const natcashApiSecret =
    safeDecryptSecret(settingsMap.natcash_api_secret) || process.env.NATCASH_API_SECRET || '';
  const natcashWebhookSecret =
    safeDecryptSecret(settingsMap.natcash_webhook_secret) || process.env.PAYMENT_WEBHOOK_SECRET || '';
  const natcashApiConfigured = Boolean(natcashApiKey && (natcashMerchantId || natcashMerchantCode));

  return {
    moncash: {
      merchantNumber: settingsMap.moncash_merchant_number || '+509 3700-0000',
      merchantCode: settingsMap.moncash_merchant_code || '',
      merchantName: settingsMap.moncash_merchant_name || 'KAL-SU GIFT HAITI',
      feePercent: Number(settingsMap.moncash_fee_percent || '2.0'),
      env: moncashEnv as 'sandbox' | 'production',
      verificationMode: moncashMode as 'manual' | 'auto_api',
      apiUrl:
        settingsMap.moncash_api_url ||
        (moncashEnv === 'production'
          ? 'https://moncashbutton.digicelgroup.com/Api'
          : 'https://sandbox.moncashbutton.digicelgroup.com/Api'),
      clientId: moncashClientId,
      clientSecret: moncashClientSecret,
      webhookSecret: moncashWebhookSecret,
      hasClientId: Boolean(moncashClientId),
      hasClientSecret: Boolean(moncashClientSecret),
      hasWebhookSecret: Boolean(moncashWebhookSecret),
      maskedClientId: moncashClientId ? maskSecret(moncashClientId, true) : '',
      maskedClientSecret: moncashClientSecret ? maskSecret(moncashClientSecret, true) : '',
      maskedWebhookSecret: moncashWebhookSecret ? maskSecret(moncashWebhookSecret, true) : '',
      autoApiConfigured: moncashApiConfigured,
      autoApiActive: moncashMode === 'auto_api' && moncashApiConfigured,
      lastTestStatus: settingsMap.moncash_last_test_status || 'pending',
      lastTestMessage:
        settingsMap.moncash_last_test_message ||
        'Identifiants API MonCash non encore configurés — Validation manuelle par référence active.',
    },
    natcash: {
      merchantNumber: settingsMap.natcash_merchant_number || '+509 4100-0000',
      merchantCode: natcashMerchantCode,
      merchantId: natcashMerchantId,
      merchantName: settingsMap.natcash_merchant_name || 'KAL-SU GIFT NATCASH',
      feePercent: Number(settingsMap.natcash_fee_percent || '1.5'),
      env: natcashEnv as 'sandbox' | 'production',
      verificationMode: natcashMode as 'manual' | 'auto_api',
      apiUrl: settingsMap.natcash_api_url || '',
      apiKey: natcashApiKey,
      apiSecret: natcashApiSecret,
      webhookSecret: natcashWebhookSecret,
      hasApiKey: Boolean(natcashApiKey),
      hasApiSecret: Boolean(natcashApiSecret),
      hasWebhookSecret: Boolean(natcashWebhookSecret),
      maskedApiKey: natcashApiKey ? maskSecret(natcashApiKey, true) : '',
      maskedApiSecret: natcashApiSecret ? maskSecret(natcashApiSecret, true) : '',
      maskedWebhookSecret: natcashWebhookSecret ? maskSecret(natcashWebhookSecret, true) : '',
      autoApiConfigured: natcashApiConfigured,
      autoApiActive: natcashMode === 'auto_api' && natcashApiConfigured,
      lastTestStatus: settingsMap.natcash_last_test_status || 'pending',
      lastTestMessage:
        settingsMap.natcash_last_test_message ||
        'Identifiants API NatCash non encore configurés — Validation manuelle par référence active.',
    },
  };
}

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'kal-su-gift', timestamp: new Date().toISOString() });
});

// ==========================================
// PUBLIC STOREFRONT DATA
// ==========================================
app.get('/api/storefront', async (_req, res) => {
  try {
    const [rate, settingsMap, cats, prods, variants, promos, dlsCompat] = await Promise.all([
      getCurrentExchangeRate(),
      getSettingsMap(),
      db.select().from(categories).where(eq(categories.isActive, true)).orderBy(categories.sortOrder),
      db.select().from(products).where(eq(products.isActive, true)).orderBy(products.id),
      db.select().from(productVariants).where(eq(productVariants.isActive, true)).orderBy(productVariants.id),
      db.select().from(promotions).where(eq(promotions.isActive, true)).orderBy(desc(promotions.id)),
      checkDlsSupplierCompatibility(),
    ]);

    const variantsByProduct = new Map<number, typeof variants>();
    for (const v of variants) {
      const list = variantsByProduct.get(v.productId) ?? [];
      list.push(v);
      variantsByProduct.set(v.productId, list);
    }

    const enrichedProducts = prods.map((p) => ({
      ...p,
      variants: variantsByProduct.get(p.id) ?? [],
    }));

    const gateways = getPaymentGatewaysState(settingsMap);

    res.json({
      exchangeRate: rate,
      categories: cats,
      products: enrichedProducts,
      promotions: promos,
      dlsCompatibility: dlsCompat,
      merchantConfig: {
        moncashNumber: gateways.moncash.merchantNumber,
        moncashMerchantCode: gateways.moncash.merchantCode,
        moncashName: gateways.moncash.merchantName,
        moncashFeePercent: gateways.moncash.feePercent,
        natcashNumber: gateways.natcash.merchantNumber,
        natcashMerchantCode: gateways.natcash.merchantCode,
        natcashName: gateways.natcash.merchantName,
        natcashFeePercent: gateways.natcash.feePercent,
        whatsappNumber: settingsMap.whatsapp_support_number || '+50937000000',
        supportEmail: settingsMap.support_email || 'support@kalsugift.ht',
        moncashAutoApiEnabled: gateways.moncash.autoApiActive,
        natcashAutoApiEnabled: gateways.natcash.autoApiActive,
      },
    });
  } catch (error) {
    console.error('Storefront load error:', error);
    res.status(500).json({ error: 'Impossible de charger le catalogue' });
  }
});

app.post('/api/coupons/validate', async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const subtotalUsd = Number(req.body?.subtotalUsd || 0);
    if (!code) {
      return res.status(400).json({ error: 'Code promo requis' });
    }
    const rows = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.code, code), eq(coupons.isActive, true)))
      .limit(1);
    const coupon = rows[0];
    if (!coupon) {
      return res.status(404).json({ error: 'Code promo invalide ou expiré' });
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Ce code promo est expiré' });
    }
    if (coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ error: 'Ce code promo a atteint sa limite d’utilisation' });
    }
    if (subtotalUsd < Number(coupon.minOrderUsd)) {
      return res.status(400).json({
        error: `Montant minimum requis: $${Number(coupon.minOrderUsd).toFixed(2)} USD`,
      });
    }

    const discountUsd =
      coupon.discountType === 'percent'
        ? (subtotalUsd * Number(coupon.discountValue)) / 100
        : Math.min(subtotalUsd, Number(coupon.discountValue));

    res.json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      discountUsd: Number(discountUsd.toFixed(2)),
    });
  } catch (error) {
    console.error('Coupon validate error:', error);
    res.status(500).json({ error: 'Erreur lors de la validation du code promo' });
  }
});

// ==========================================
// AUTHENTICATION & ACCOUNT
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '');

    if (!fullName || !email || !phone || password.length < 8) {
      return res.status(400).json({
        error: 'Nom complet, email, téléphone et mot de passe (min. 8 caractères) requis.',
      });
    }

    const existing = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);

    if (existing[0]) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });
    }

    const customerRoleId = await getCustomerRoleId();
    const [created] = await db
      .insert(profiles)
      .values({
        fullName,
        email,
        phone,
        passwordHash: hashPassword(password),
        roleId: customerRoleId,
        preferredLang: String(req.body?.preferredLang || 'fr'),
        preferredCurrency: String(req.body?.preferredCurrency || 'HTG'),
      })
      .returning();

    const token = signSessionToken({
      profileId: created.id,
      email: created.email,
      roleName: 'customer',
    });

    await dispatchNotification({
      userId: created.id,
      eventType: 'registration',
      title: 'Bienvenue sur KAL-SU GIFT',
      message: `Bonjour ${created.fullName}, votre compte est prêt pour commander vos cartes cadeaux et recharges DLS.`,
      recipientEmail: created.email,
      recipientPhone: created.phone,
    });

    await logAudit(created.id, 'user_registered', 'profile', String(created.id), { email }, req.ip);

    res.status(201).json({
      token,
      profile: {
        id: created.id,
        fullName: created.fullName,
        email: created.email,
        phone: created.phone,
        roleName: 'customer',
        permissions: ['orders:create', 'orders:read_own', 'tickets:create'],
        loyaltyPoints: created.loyaltyPoints,
        preferredLang: created.preferredLang,
        preferredCurrency: created.preferredCurrency,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erreur lors de l’inscription' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }

    const rows = await db
      .select({
        profile: profiles,
        role: roles,
      })
      .from(profiles)
      .innerJoin(roles, eq(profiles.roleId, roles.id))
      .where(eq(profiles.email, email))
      .limit(1);

    const row = rows[0];
    if (!row || !row.profile.passwordHash) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    const user = row.profile;
    const storedHash = row.profile.passwordHash;
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const waitMin = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({
        error: `Compte temporairement verrouillé après plusieurs tentatives. Réessayez dans ${waitMin} min.`,
      });
    }

    const valid = verifyPassword(password, storedHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db
        .update(profiles)
        .set({
          failedLoginAttempts: attempts,
          lockedUntil,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, user.id));

      await logAudit(user.id, 'login_failed', 'profile', String(user.id), { attempts }, req.ip);
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    await db
      .update(profiles)
      .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(profiles.id, user.id));

    const token = signSessionToken({
      profileId: user.id,
      email: user.email,
      roleName: row.role.name,
    });

    await logAudit(user.id, 'login_success', 'profile', String(user.id), {}, req.ip);

    res.json({
      token,
      profile: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        roleName: row.role.name,
        permissions: row.role.permissions,
        loyaltyPoints: user.loyaltyPoints,
        preferredLang: user.preferredLang,
        preferredCurrency: user.preferredCurrency,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Email requis.' });
    }

    const rows = await db
      .select({ id: profiles.id, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);

    if (rows[0]) {
      const resetToken = crypto.randomBytes(4).toString('hex').toUpperCase();
      await db
        .update(profiles)
        .set({
          resetToken,
          resetTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, rows[0].id));

      await dispatchNotification({
        userId: rows[0].id,
        eventType: 'password_reset',
        title: 'Réinitialisation de mot de passe',
        message: `Votre code de réinitialisation valable 15 minutes : ${resetToken}`,
        recipientEmail: rows[0].email,
      });

      await logAudit(rows[0].id, 'password_reset_requested', 'profile', String(rows[0].id), {}, req.ip);
    }

    res.json({
      ok: true,
      message: 'Si cet email est enregistré, un code de réinitialisation a été généré.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Erreur lors de la demande' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const token = String(req.body?.token || '').trim().toUpperCase();
    const newPassword = String(req.body?.newPassword || '');

    if (!email || !token || newPassword.length < 8) {
      return res.status(400).json({ error: 'Email, code et nouveau mot de passe (min. 8 car.) requis.' });
    }

    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);

    const user = rows[0];
    if (
      !user ||
      !user.resetToken ||
      user.resetToken !== token ||
      !user.resetTokenExpiresAt ||
      user.resetTokenExpiresAt < new Date()
    ) {
      return res.status(400).json({ error: 'Code de réinitialisation invalide ou expiré.' });
    }

    await db
      .update(profiles)
      .set({
        passwordHash: hashPassword(newPassword),
        resetToken: null,
        resetTokenExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, user.id));

    await logAudit(user.id, 'password_reset_completed', 'profile', String(user.id), {}, req.ip);
    res.json({ ok: true });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation' });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  res.json({ profile: req.profile });
});

app.patch('/api/auth/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = req.profile!;
    const fullName = String(req.body?.fullName || profile.fullName).trim();
    const phone = req.body?.phone !== undefined ? String(req.body.phone).trim() : profile.phone;
    const preferredLang = String(req.body?.preferredLang || profile.preferredLang);
    const preferredCurrency = String(req.body?.preferredCurrency || profile.preferredCurrency);

    const [updated] = await db
      .update(profiles)
      .set({
        fullName,
        phone,
        preferredLang,
        preferredCurrency,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profile.id))
      .returning();

    res.json({
      profile: {
        ...profile,
        fullName: updated.fullName,
        phone: updated.phone,
        preferredLang: updated.preferredLang,
        preferredCurrency: updated.preferredCurrency,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour le profil' });
  }
});

// ==========================================
// ORDERS, DLS TOP-UP & PAYMENTS (AUTH REQUIRED)
// ==========================================
app.post('/api/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.profile!;
    const variantId = Number(req.body?.variantId);
    const quantity = Math.max(1, Math.min(10, Number(req.body?.quantity || 1)));
    const currency = req.body?.currency === 'USD' ? 'USD' : 'HTG';
    const paymentMethod = req.body?.paymentMethod === 'natcash' ? 'natcash' : 'moncash';
    const couponCode = req.body?.couponCode ? String(req.body.couponCode).trim().toUpperCase() : null;
    const playerId = req.body?.playerId ? String(req.body.playerId).trim() : null;
    const playerIdConfirmed = req.body?.playerIdConfirmed
      ? String(req.body.playerIdConfirmed).trim()
      : null;
    const idempotencyKey =
      String(req.body?.idempotencyKey || '').trim() ||
      `ksg-${user.id}-${variantId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    // Protection contre les commandes en double
    const duplicate = await db
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey))
      .limit(1);
    if (duplicate[0]) {
      return res.status(200).json({ order: duplicate[0], deduplicated: true });
    }

    const variantRows = await db
      .select({
        variant: productVariants,
        product: products,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(eq(productVariants.id, variantId), eq(productVariants.isActive, true)))
      .limit(1);

    if (!variantRows[0] || !variantRows[0].product.isActive) {
      return res.status(404).json({ error: 'Produit ou forfait introuvable' });
    }

    const { variant, product } = variantRows[0];

    if (variant.stockStatus === 'out_of_stock') {
      return res.status(400).json({ error: 'Ce forfait est actuellement en rupture de stock' });
    }

    if (product.requiresPlayerId) {
      if (!playerId || !playerIdConfirmed) {
        return res.status(400).json({ error: 'Player ID et confirmation du Player ID requis.' });
      }
      if (playerId !== playerIdConfirmed) {
        return res.status(400).json({ error: 'Les deux saisies du Player ID ne correspondent pas.' });
      }
      if (playerId.length < 4 || playerId.length > 40) {
        return res.status(400).json({ error: 'Format Player ID invalide.' });
      }
    }

    const rate = await getCurrentExchangeRate();
    const settingsMap = await getSettingsMap();
    const unitPriceUsd = Number(variant.promoPriceUsd || variant.sellingPriceUsd);
    const unitCostUsd = Number(variant.supplierCostUsd);
    const subtotalUsd = Number((unitPriceUsd * quantity).toFixed(2));

    let discountUsd = 0;
    let appliedCoupon: string | null = null;
    if (couponCode) {
      const couponRows = await db
        .select()
        .from(coupons)
        .where(and(eq(coupons.code, couponCode), eq(coupons.isActive, true)))
        .limit(1);
      const coupon = couponRows[0];
      if (
        coupon &&
        (!coupon.expiresAt || coupon.expiresAt >= new Date()) &&
        coupon.usedCount < coupon.maxUses &&
        subtotalUsd >= Number(coupon.minOrderUsd)
      ) {
        discountUsd =
          coupon.discountType === 'percent'
            ? (subtotalUsd * Number(coupon.discountValue)) / 100
            : Math.min(subtotalUsd, Number(coupon.discountValue));
        discountUsd = Number(discountUsd.toFixed(2));
        appliedCoupon = coupon.code;
        await db
          .update(coupons)
          .set({ usedCount: coupon.usedCount + 1 })
          .where(eq(coupons.id, coupon.id));
      }
    }

    const netBeforeFeeUsd = Math.max(0.5, subtotalUsd - discountUsd);
    const feePct =
      paymentMethod === 'moncash'
        ? Number(settingsMap.moncash_fee_percent || '2.0')
        : Number(settingsMap.natcash_fee_percent || '1.5');
    const paymentFeeUsd = Number(((netBeforeFeeUsd * feePct) / 100).toFixed(2));
    const totalUsd = Number((netBeforeFeeUsd + paymentFeeUsd).toFixed(2));
    const totalHtg = Number((totalUsd * rate).toFixed(2));
    const totalCostUsd = Number((unitCostUsd * quantity).toFixed(2));
    const estimatedProfitUsd = Number((netBeforeFeeUsd - totalCostUsd).toFixed(2));

    const orderRef = `KSG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;

    const [createdOrder] = await db
      .insert(orders)
      .values({
        orderRef,
        idempotencyKey,
        userId: user.id,
        status: 'pending_payment',
        currency,
        exchangeRateUsed: rate.toFixed(4),
        subtotalUsd: subtotalUsd.toFixed(2),
        discountUsd: discountUsd.toFixed(2),
        paymentFeeUsd: paymentFeeUsd.toFixed(2),
        totalUsd: totalUsd.toFixed(2),
        totalHtg: totalHtg.toFixed(2),
        supplierCostUsd: totalCostUsd.toFixed(2),
        estimatedProfitUsd: estimatedProfitUsd.toFixed(2),
        paymentMethod,
        couponCode: appliedCoupon,
        playerId,
        playerIdConfirmed,
      })
      .returning();

    await db.insert(orderItems).values({
      orderId: createdOrder.id,
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      variantLabel: variant.label,
      quantity,
      unitPriceUsd: unitPriceUsd.toFixed(2),
      supplierCostUsd: unitCostUsd.toFixed(2),
      regionCode: product.compatibleRegions,
    });

    await dispatchNotification({
      userId: user.id,
      orderId: createdOrder.id,
      eventType: 'order_created',
      title: `Commande ${orderRef} créée`,
      message: `${product.name} (${variant.label}) — Montant à régler: ${
        currency === 'HTG' ? `${totalHtg.toFixed(2)} HTG` : `$${totalUsd.toFixed(2)} USD`
      } via ${paymentMethod.toUpperCase()}.`,
      recipientEmail: user.email,
      recipientPhone: user.phone,
    });

    await logAudit(
      user.id,
      'order_created',
      'order',
      orderRef,
      { product: product.name, variant: variant.label, currency, totalUsd, totalHtg, rate },
      req.ip
    );

    res.status(201).json({ order: createdOrder });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la commande' });
  }
});

app.post('/api/orders/:orderRef/pay', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.profile!;
    const orderRef = String(req.params.orderRef);
    const transactionRef = String(req.body?.transactionRef || '').trim().toUpperCase();
    const method = req.body?.method === 'natcash' ? 'natcash' : 'moncash';

    if (!transactionRef || transactionRef.length < 5) {
      return res.status(400).json({
        error: 'Veuillez saisir une référence de transaction MonCash/NatCash valide (min. 5 caractères).',
      });
    }

    const orderRows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.orderRef, orderRef), eq(orders.userId, user.id)))
      .limit(1);

    const order = orderRows[0];
    if (!order) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    if (order.status !== 'pending_payment' && order.status !== 'failed') {
      return res.status(400).json({ error: 'Un paiement est déjà enregistré pour cette commande.' });
    }

    // Anti-fraud: ensure transactionRef has never been used
    const dupTx = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.transactionRef, transactionRef))
      .limit(1);

    if (dupTx[0]) {
      return res.status(409).json({
        error: 'Cette référence de transaction a déjà été utilisée pour une autre commande.',
      });
    }

    const settingsMap = await getSettingsMap();
    const gateways = getPaymentGatewaysState(settingsMap);
    const merchantNumber =
      method === 'moncash'
        ? gateways.moncash.merchantNumber
        : gateways.natcash.merchantNumber;

    const amount = order.currency === 'HTG' ? order.totalHtg : order.totalUsd;

    // Never simulate a payment confirmation!
    // Only use auto_api if official credentials exist (DB encrypted config or env) AND mode is auto_api.
    const verificationMode =
      (method === 'moncash' && gateways.moncash.autoApiActive) ||
      (method === 'natcash' && gateways.natcash.autoApiActive)
        ? 'auto_api'
        : 'manual_admin';

    const [createdPayment] = await db
      .insert(payments)
      .values({
        orderId: order.id,
        userId: user.id,
        method,
        merchantNumber,
        transactionRef,
        amount,
        currency: order.currency,
        status: 'verifying',
        verificationMode,
      })
      .returning();

    await db
      .update(orders)
      .set({
        status: 'payment_verifying',
        paymentMethod: method,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    await dispatchNotification({
      userId: user.id,
      orderId: order.id,
      eventType: 'payment_submitted',
      title: `Paiement en vérification — ${order.orderRef}`,
      message: `Référence ${transactionRef} (${method.toUpperCase()}) soumise pour validation sécurisée.`,
      recipientEmail: user.email,
      recipientPhone: user.phone,
    });

    await logAudit(
      user.id,
      'payment_submitted',
      'payment',
      String(createdPayment.id),
      { orderRef, method, transactionRef, verificationMode },
      req.ip
    );

    res.status(201).json({
      payment: createdPayment,
      orderStatus: 'payment_verifying',
    });
  } catch (error) {
    console.error('Submit payment error:', error);
    res.status(500).json({ error: 'Erreur lors de la soumission du paiement' });
  }
});

app.get('/api/orders/mine', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.profile!;
    const myOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt));

    const enriched = await Promise.all(
      myOrders.map(async (ord) => {
        const [items, pms, rfs] = await Promise.all([
          db.select().from(orderItems).where(eq(orderItems.orderId, ord.id)),
          db.select().from(payments).where(eq(payments.orderId, ord.id)),
          db.select().from(refunds).where(eq(refunds.orderId, ord.id)),
        ]);
        return { ...ord, items, payments: pms, refunds: rfs };
      })
    );

    res.json({ orders: enriched });
  } catch (error) {
    console.error('Fetch my orders error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des commandes' });
  }
});

app.get('/api/orders/:orderRef', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.profile!;
    const orderRef = String(req.params.orderRef);
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.orderRef, orderRef))
      .limit(1);
    const order = rows[0];
    if (!order) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }
    const canReadAll =
      user.permissions.includes('*') || user.permissions.includes('orders:read_all');
    if (order.userId !== user.id && !canReadAll) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const [items, pms, supTx, rfs] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
      db.select().from(payments).where(eq(payments.orderId, order.id)),
      db.select().from(supplierTransactions).where(eq(supplierTransactions.orderId, order.id)),
      db.select().from(refunds).where(eq(refunds.orderId, order.id)),
    ]);

    res.json({ order: { ...order, items, payments: pms, supplierTransactions: supTx, refunds: rfs } });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Erreur lors de la lecture de la commande' });
  }
});

app.post('/api/orders/:orderRef/refund', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.profile!;
    const orderRef = String(req.params.orderRef);
    const reason = String(req.body?.reason || '').trim();
    if (!reason || reason.length < 5) {
      return res.status(400).json({ error: 'Veuillez indiquer un motif de remboursement.' });
    }

    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.orderRef, orderRef), eq(orders.userId, user.id)))
      .limit(1);
    const order = rows[0];
    if (!order) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    const pms = await db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
    const amount = order.currency === 'HTG' ? order.totalHtg : order.totalUsd;

    const [refund] = await db
      .insert(refunds)
      .values({
        orderId: order.id,
        paymentId: pms[0]?.id ?? null,
        userId: user.id,
        amount,
        currency: order.currency,
        reason,
        status: 'requested',
      })
      .returning();

    await logAudit(user.id, 'refund_requested', 'refund', String(refund.id), { orderRef, reason }, req.ip);
    res.status(201).json({ refund });
  } catch (error) {
    console.error('Refund request error:', error);
    res.status(500).json({ error: 'Erreur lors de la demande de remboursement' });
  }
});

// ==========================================
// WEBHOOK VALIDATION (MONCASH / NATCASH)
// ==========================================
app.post('/api/webhooks/payment', async (req, res) => {
  try {
    const settingsMap = await getSettingsMap();
    const gateways = getPaymentGatewaysState(settingsMap);
    const gatewayHint = String(req.body?.method || req.headers['x-payment-gateway'] || '').toLowerCase();
    const webhookSecret =
      gatewayHint === 'natcash'
        ? gateways.natcash.webhookSecret
        : gatewayHint === 'moncash'
        ? gateways.moncash.webhookSecret
        : gateways.moncash.webhookSecret || gateways.natcash.webhookSecret || process.env.PAYMENT_WEBHOOK_SECRET;

    const signature = String(req.headers['x-webhook-signature'] || '');
    if (!webhookSecret) {
      return res.status(503).json({
        error: 'Secret webhook paiement non encore configuré (Admin > MonCash & NatCash).',
      });
    }
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (!signature || sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ error: 'Signature webhook invalide' });
    }

    const transactionRef = String(req.body?.transactionRef || '').trim().toUpperCase();
    const status = req.body?.status === 'verified' ? 'verified' : 'rejected';

    const pmRows = await db
      .select()
      .from(payments)
      .where(eq(payments.transactionRef, transactionRef))
      .limit(1);
    const pm = pmRows[0];
    if (!pm) {
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    await db
      .update(payments)
      .set({
        status,
        verifiedAt: new Date(),
        webhookPayload: req.body,
      })
      .where(eq(payments.id, pm.id));

    if (status === 'verified') {
      await db
        .update(orders)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(orders.id, pm.orderId));
      await dispatchOrderToSupplier(pm.orderId);
    } else {
      await db
        .update(orders)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(orders.id, pm.orderId));
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// ==========================================
// NOTIFICATIONS & SUPPORT TICKETS
// ==========================================
app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.profile!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json({ notifications: rows });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ error: 'Erreur notifications' });
  }
});

app.patch('/api/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, Number(req.params.id)), eq(notifications.userId, req.profile!.id)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Notification mark read error:', error);
    res.status(500).json({ error: 'Erreur mise à jour notification' });
  }
});

app.get('/api/tickets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.profile!;
    const canManage = user.permissions.includes('*') || user.permissions.includes('tickets:manage');
    const rows = canManage
      ? await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt))
      : await db
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.userId, user.id))
          .orderBy(desc(supportTickets.createdAt));

    res.json({ tickets: rows });
  } catch (error) {
    console.error('Tickets fetch error:', error);
    res.status(500).json({ error: 'Erreur chargement tickets' });
  }
});

app.post('/api/tickets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.profile!;
    const subject = String(req.body?.subject || '').trim();
    const category = String(req.body?.category || 'general');
    const message = String(req.body?.message || '').trim();
    const orderId = req.body?.orderId ? Number(req.body.orderId) : null;

    if (!subject || !message) {
      return res.status(400).json({ error: 'Sujet et message requis.' });
    }

    const ticketRef = `KSG-TKT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const [created] = await db
      .insert(supportTickets)
      .values({
        ticketRef,
        userId: user.id,
        orderId,
        subject,
        category,
        message,
        status: 'open',
      })
      .returning();

    await logAudit(user.id, 'ticket_created', 'support_ticket', ticketRef, { subject }, req.ip);
    res.status(201).json({ ticket: created });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Erreur création ticket' });
  }
});

// ==========================================
// ADMIN, FINANCE & SUPPLIER CONSOLE
// ==========================================
app.get('/api/admin/overview', requireAuth, requirePermission('orders:read_all'), async (_req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [allOrders, allProfiles, pendingPayments, allSuppliers, allRefunds, rate] = await Promise.all([
      db.select().from(orders),
      db.select({ id: profiles.id }).from(profiles),
      db.select().from(payments).where(eq(payments.status, 'verifying')),
      db.select().from(suppliers),
      db.select().from(refunds),
      getCurrentExchangeRate(),
    ]);

    const todayOrders = allOrders.filter((o) => o.createdAt >= todayStart);
    const deliveredOrders = allOrders.filter((o) => o.status === 'delivered');
    const pendingOrders = allOrders.filter(
      (o) =>
        o.status === 'pending_payment' ||
        o.status === 'payment_verifying' ||
        o.status === 'paid' ||
        o.status === 'processing'
    );
    const revenueOrders = allOrders.filter(
      (o) => o.status === 'paid' || o.status === 'processing' || o.status === 'delivered'
    );

    const totalRevenueUsd = revenueOrders.reduce((s, o) => s + Number(o.totalUsd), 0);
    const totalRevenueHtg = revenueOrders.reduce((s, o) => s + Number(o.totalHtg), 0);
    const totalSupplierCostUsd = revenueOrders.reduce((s, o) => s + Number(o.supplierCostUsd), 0);
    const totalPaymentFeesUsd = revenueOrders.reduce((s, o) => s + Number(o.paymentFeeUsd), 0);
    const totalEstimatedProfitUsd = revenueOrders.reduce((s, o) => s + Number(o.estimatedProfitUsd), 0);
    const totalRefundsUsd = allRefunds
      .filter((r) => r.status === 'processed')
      .reduce((s, r) => s + Number(r.amount) / (r.currency === 'HTG' ? rate : 1), 0);

    res.json({
      kpis: {
        totalRevenueUsd: Number(totalRevenueUsd.toFixed(2)),
        totalRevenueHtg: Number(totalRevenueHtg.toFixed(2)),
        totalSupplierCostUsd: Number(totalSupplierCostUsd.toFixed(2)),
        totalPaymentFeesUsd: Number(totalPaymentFeesUsd.toFixed(2)),
        totalEstimatedProfitUsd: Number(totalEstimatedProfitUsd.toFixed(2)),
        totalRefundsUsd: Number(totalRefundsUsd.toFixed(2)),
        customerCount: allProfiles.length,
        todayOrdersCount: todayOrders.length,
        pendingOrdersCount: pendingOrders.length,
        deliveredOrdersCount: deliveredOrders.length,
        paymentsAwaitingVerification: pendingPayments.length,
        exchangeRate: rate,
      },
      suppliersSummary: allSuppliers.map((s) => ({
        id: s.id,
        name: s.name,
        priority: s.priority,
        isActive: s.isActive,
        lastTestStatus: s.lastTestStatus,
        lastTestMessage: s.lastTestMessage,
      })),
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ error: 'Erreur tableau de bord admin' });
  }
});

app.get('/api/admin/orders', requireAuth, requirePermission('orders:read_all'), async (_req, res) => {
  try {
    const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(100);
    const enriched = await Promise.all(
      allOrders.map(async (ord) => {
        const [customerRows, items, pms, supTx, rfs] = await Promise.all([
          db
            .select({ fullName: profiles.fullName, email: profiles.email, phone: profiles.phone })
            .from(profiles)
            .where(eq(profiles.id, ord.userId))
            .limit(1),
          db.select().from(orderItems).where(eq(orderItems.orderId, ord.id)),
          db.select().from(payments).where(eq(payments.orderId, ord.id)),
          db.select().from(supplierTransactions).where(eq(supplierTransactions.orderId, ord.id)),
          db.select().from(refunds).where(eq(refunds.orderId, ord.id)),
        ]);
        return {
          ...ord,
          customer: customerRows[0] ?? null,
          items,
          payments: pms,
          supplierTransactions: supTx,
          refunds: rfs,
        };
      })
    );
    res.json({ orders: enriched });
  } catch (error) {
    console.error('Admin orders error:', error);
    res.status(500).json({ error: 'Erreur chargement commandes admin' });
  }
});

app.post(
  '/api/admin/payments/:paymentId/verify',
  requireAuth,
  requirePermission('payments:verify'),
  async (req: AuthRequest, res) => {
    try {
      const paymentId = Number(req.params.paymentId);
      const action = req.body?.action === 'reject' ? 'reject' : 'approve';
      const reason = String(req.body?.reason || '').trim();

      const pmRows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
      const pm = pmRows[0];
      if (!pm) {
        return res.status(404).json({ error: 'Paiement introuvable' });
      }

      const orderRows = await db.select().from(orders).where(eq(orders.id, pm.orderId)).limit(1);
      const order = orderRows[0];
      if (!order) {
        return res.status(404).json({ error: 'Commande introuvable' });
      }

      const customerRows = await db.select().from(profiles).where(eq(profiles.id, order.userId)).limit(1);
      const customer = customerRows[0];

      if (action === 'reject') {
        await db
          .update(payments)
          .set({
            status: 'rejected',
            verifiedBy: req.profile!.id,
            verifiedAt: new Date(),
            rejectionReason: reason || 'Référence non trouvée dans le relevé marchand',
          })
          .where(eq(payments.id, pm.id));

        await db
          .update(orders)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(orders.id, order.id));

        if (customer) {
          await dispatchNotification({
            userId: customer.id,
            orderId: order.id,
            eventType: 'payment_rejected',
            title: `Paiement refusé — ${order.orderRef}`,
            message: reason || 'La référence de transaction n’a pas pu être confirmée.',
            recipientEmail: customer.email,
            recipientPhone: customer.phone,
          });
        }

        await logAudit(req.profile!.id, 'payment_rejected', 'payment', String(pm.id), { reason }, req.ip);
        return res.json({ ok: true, status: 'rejected' });
      }

      await db
        .update(payments)
        .set({
          status: 'verified',
          verifiedBy: req.profile!.id,
          verifiedAt: new Date(),
        })
        .where(eq(payments.id, pm.id));

      await db
        .update(orders)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      if (customer) {
        // Award loyalty points (1 point per $1 USD)
        const pointsEarned = Math.max(1, Math.floor(Number(order.totalUsd)));
        await db
          .update(profiles)
          .set({ loyaltyPoints: customer.loyaltyPoints + pointsEarned })
          .where(eq(profiles.id, customer.id));

        await dispatchNotification({
          userId: customer.id,
          orderId: order.id,
          eventType: 'payment_verified',
          title: `Paiement confirmé — ${order.orderRef}`,
          message: `Votre paiement ${pm.method.toUpperCase()} (${pm.transactionRef}) est validé. Traitement en cours.`,
          recipientEmail: customer.email,
          recipientPhone: customer.phone,
        });
      }

      const dispatchResult = await dispatchOrderToSupplier(order.id);
      await logAudit(
        req.profile!.id,
        'payment_verified',
        'payment',
        String(pm.id),
        { orderRef: order.orderRef, dispatchResult },
        req.ip
      );

      res.json({ ok: true, status: 'verified', dispatchResult });
    } catch (error) {
      console.error('Verify payment error:', error);
      res.status(500).json({ error: 'Erreur lors de la vérification du paiement' });
    }
  }
);

app.post(
  '/api/admin/orders/:orderId/deliver',
  requireAuth,
  requirePermission('orders:manage'),
  async (req: AuthRequest, res) => {
    try {
      const orderId = Number(req.params.orderId);
      const codeOrReceipt = String(req.body?.codeOrReceipt || '').trim();
      const notes = String(req.body?.notes || '').trim();

      if (!codeOrReceipt) {
        return res.status(400).json({ error: 'Code carte cadeau ou reçu de recharge requis.' });
      }

      const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const order = orderRows[0];
      if (!order) {
        return res.status(404).json({ error: 'Commande introuvable' });
      }

      await db
        .update(orders)
        .set({
          status: 'delivered',
          deliveryPayload: {
            mode: 'manual_admin',
            codeOrReceipt,
            notes,
            deliveredAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      const customerRows = await db.select().from(profiles).where(eq(profiles.id, order.userId)).limit(1);
      if (customerRows[0]) {
        await dispatchNotification({
          userId: customerRows[0].id,
          orderId: order.id,
          eventType: 'order_delivered',
          title: `Livraison terminée — ${order.orderRef}`,
          message: `Votre commande ${order.orderRef} a été livrée avec succès. Consultez votre espace client pour voir les détails.`,
          recipientEmail: customerRows[0].email,
          recipientPhone: customerRows[0].phone,
        });
      }

      await logAudit(
        req.profile!.id,
        'order_delivered_manually',
        'order',
        order.orderRef,
        { notes },
        req.ip
      );

      res.json({ ok: true });
    } catch (error) {
      console.error('Manual deliver error:', error);
      res.status(500).json({ error: 'Erreur lors de la livraison manuelle' });
    }
  }
);

app.post(
  '/api/admin/refunds/:refundId/process',
  requireAuth,
  requirePermission('refunds:manage'),
  async (req: AuthRequest, res) => {
    try {
      const refundId = Number(req.params.refundId);
      const status = req.body?.status === 'rejected' ? 'rejected' : 'processed';

      const rows = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
      const rf = rows[0];
      if (!rf) {
        return res.status(404).json({ error: 'Demande de remboursement introuvable' });
      }

      await db
        .update(refunds)
        .set({
          status,
          processedBy: req.profile!.id,
          processedAt: new Date(),
        })
        .where(eq(refunds.id, rf.id));

      if (status === 'processed') {
        await db
          .update(orders)
          .set({ status: 'refunded', updatedAt: new Date() })
          .where(eq(orders.id, rf.orderId));
      }

      const customerRows = await db.select().from(profiles).where(eq(profiles.id, rf.userId)).limit(1);
      if (customerRows[0]) {
        await dispatchNotification({
          userId: customerRows[0].id,
          orderId: rf.orderId,
          eventType: 'refund_updated',
          title: status === 'processed' ? 'Remboursement effectué' : 'Demande de remboursement refusée',
          message: `Montant: ${rf.amount} ${rf.currency} — Statut: ${status}`,
          recipientEmail: customerRows[0].email,
          recipientPhone: customerRows[0].phone,
        });
      }

      await logAudit(req.profile!.id, 'refund_processed', 'refund', String(rf.id), { status }, req.ip);
      res.json({ ok: true });
    } catch (error) {
      console.error('Process refund error:', error);
      res.status(500).json({ error: 'Erreur traitement remboursement' });
    }
  }
);

// SUPPLIER API MANAGEMENT
app.get('/api/admin/suppliers', requireAuth, requirePermission('suppliers:manage'), async (_req, res) => {
  try {
    const [sups, supProds] = await Promise.all([
      db.select().from(suppliers).orderBy(suppliers.priority, suppliers.id),
      db.select().from(supplierProducts).orderBy(desc(supplierProducts.id)).limit(100),
    ]);

    res.json({
      suppliers: sups.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        priority: s.priority,
        apiUrl: s.apiUrl,
        maskedApiKey: maskSecret(s.encryptedApiKey),
        authType: s.authType,
        supportsDls: s.supportsDls,
        isActive: s.isActive,
        lastTestStatus: s.lastTestStatus,
        lastTestMessage: s.lastTestMessage,
        lastTestedAt: s.lastTestedAt,
      })),
      supplierProducts: supProds,
    });
  } catch (error) {
    console.error('List suppliers error:', error);
    res.status(500).json({ error: 'Erreur chargement fournisseurs' });
  }
});

app.post('/api/admin/suppliers', requireAuth, requirePermission('suppliers:manage'), async (req: AuthRequest, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const code = String(req.body?.code || '').trim().toUpperCase();
    const priority = req.body?.priority === 'secondary' ? 'secondary' : 'primary';
    const apiUrl = String(req.body?.apiUrl || '').trim();
    const apiKey = String(req.body?.apiKey || '').trim();
    const apiSecret = req.body?.apiSecret ? String(req.body.apiSecret).trim() : '';
    const authType = ['bearer', 'x_api_key', 'basic'].includes(String(req.body?.authType))
      ? String(req.body.authType)
      : 'bearer';
    const supportsDls = Boolean(req.body?.supportsDls);

    if (!name || !code || !apiUrl || !apiKey) {
      return res.status(400).json({ error: 'Nom, code, URL API et clé API requis.' });
    }

    const [created] = await db
      .insert(suppliers)
      .values({
        name,
        code,
        priority,
        apiUrl,
        encryptedApiKey: encryptSecret(apiKey),
        encryptedApiSecret: apiSecret ? encryptSecret(apiSecret) : null,
        authType,
        supportsDls,
        isActive: true,
      })
      .returning();

    await logAudit(req.profile!.id, 'supplier_created', 'supplier', code, { name, apiUrl, priority }, req.ip);

    res.status(201).json({
      supplier: {
        id: created.id,
        name: created.name,
        code: created.code,
        priority: created.priority,
        apiUrl: created.apiUrl,
        maskedApiKey: maskSecret(apiKey, true),
        authType: created.authType,
        supportsDls: created.supportsDls,
        isActive: created.isActive,
      },
    });
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ error: 'Erreur ajout fournisseur' });
  }
});

app.patch('/api/admin/suppliers/:id', requireAuth, requirePermission('suppliers:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const updates: Record<string, unknown> = {};
    if (req.body?.name) updates.name = String(req.body.name).trim();
    if (req.body?.apiUrl) updates.apiUrl = String(req.body.apiUrl).trim();
    if (req.body?.priority) updates.priority = req.body.priority === 'secondary' ? 'secondary' : 'primary';
    if (req.body?.apiKey) updates.encryptedApiKey = encryptSecret(String(req.body.apiKey).trim());
    if (req.body?.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);
    if (req.body?.supportsDls !== undefined) updates.supportsDls = Boolean(req.body.supportsDls);

    await db.update(suppliers).set(updates).where(eq(suppliers.id, id));
    await logAudit(req.profile!.id, 'supplier_updated', 'supplier', String(id), { keys: Object.keys(updates) }, req.ip);
    res.json({ ok: true });
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json({ error: 'Erreur mise à jour fournisseur' });
  }
});

app.delete('/api/admin/suppliers/:id', requireAuth, requirePermission('suppliers:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(suppliers).set({ isActive: false }).where(eq(suppliers.id, id));
    await logAudit(req.profile!.id, 'supplier_deactivated', 'supplier', String(id), {}, req.ip);
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete supplier error:', error);
    res.status(500).json({ error: 'Erreur désactivation fournisseur' });
  }
});

app.post('/api/admin/suppliers/:id/test', requireAuth, requirePermission('suppliers:manage'), async (req, res) => {
  try {
    const result = await testSupplierConnection(Number(req.params.id));
    res.json(result);
  } catch (error) {
    console.error('Test supplier error:', error);
    res.status(500).json({ ok: false, message: 'Erreur interne test API' });
  }
});

app.post('/api/admin/suppliers/:id/sync', requireAuth, requirePermission('suppliers:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const result = await syncSupplierCatalog(id);
    const updatedVariants = result.ok ? await syncVariantPricesFromSupplier(id) : 0;
    await logAudit(req.profile!.id, 'supplier_synced', 'supplier', String(id), { result, updatedVariants }, req.ip);
    res.json({ ...result, updatedVariants });
  } catch (error) {
    console.error('Sync supplier error:', error);
    res.status(500).json({ ok: false, importedCount: 0, message: 'Erreur synchronisation' });
  }
});

// PRODUCTS, EXCHANGE RATE, PROMOTIONS, TICKETS, SETTINGS, CUSTOMERS
app.post('/api/admin/products', requireAuth, requirePermission('products:manage'), async (req: AuthRequest, res) => {
  try {
    const {
      categoryId,
      brand,
      name,
      productType,
      descriptionFr,
      descriptionEs,
      descriptionEn,
      compatibleRegions,
      regionRestrictionNoteFr,
      deliveryTimeLabel,
      requiresPlayerId,
      marginPercent,
      variantLabel,
      faceValue,
      supplierCostUsd,
      sellingPriceUsd,
    } = req.body;

    if (!name || !brand || !categoryId || !sellingPriceUsd) {
      return res.status(400).json({ error: 'Champs produit obligatoires manquants.' });
    }

    const slug = `${String(brand)}-${String(name)}-${Date.now().toString(36)}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');

    const [created] = await db
      .insert(products)
      .values({
        categoryId: Number(categoryId),
        slug,
        brand: String(brand),
        name: String(name),
        productType: String(productType || 'gift_card'),
        descriptionFr: String(descriptionFr || name),
        descriptionEs: String(descriptionEs || descriptionFr || name),
        descriptionEn: String(descriptionEn || descriptionFr || name),
        imageUrl:
          productType === 'gift_card'
            ? '/src/assets/images/cat_gift_cards_1795058562137.jpg'
            : '/src/assets/images/cat_gaming_topup_1795058562435.jpg',
        compatibleRegions: String(compatibleRegions || 'USA (USD)'),
        regionVerified: true,
        regionRestrictionNoteFr: String(regionRestrictionNoteFr || 'Vérifiez la région avant commande.'),
        regionRestrictionNoteEs: String(regionRestrictionNoteFr || 'Verifica la región antes de comprar.'),
        regionRestrictionNoteEn: String(regionRestrictionNoteFr || 'Verify region compatibility before purchase.'),
        deliveryTimeLabel: String(deliveryTimeLabel || '5-15 min'),
        requiresPlayerId: Boolean(requiresPlayerId),
        isNew: true,
        isDemo: false,
        marginPercent: Number(marginPercent || 12).toFixed(2),
      })
      .returning();

    await db.insert(productVariants).values({
      productId: created.id,
      label: String(variantLabel || '$10 USD'),
      faceValue: String(faceValue || '10'),
      faceCurrency: 'USD',
      supplierCostUsd: Number(supplierCostUsd || Number(sellingPriceUsd) * 0.88).toFixed(2),
      sellingPriceUsd: Number(sellingPriceUsd).toFixed(2),
      stockStatus: 'in_stock',
      stockQuantity: 50,
    });

    await logAudit(req.profile!.id, 'product_created', 'product', String(created.id), { name }, req.ip);
    res.status(201).json({ product: created });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Erreur création produit' });
  }
});

app.patch('/api/admin/variants/:id', requireAuth, requirePermission('products:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const updates: Record<string, unknown> = {};
    if (req.body?.sellingPriceUsd !== undefined) {
      updates.sellingPriceUsd = Number(req.body.sellingPriceUsd).toFixed(2);
    }
    if (req.body?.supplierCostUsd !== undefined) {
      updates.supplierCostUsd = Number(req.body.supplierCostUsd).toFixed(2);
    }
    if (req.body?.promoPriceUsd !== undefined) {
      updates.promoPriceUsd = req.body.promoPriceUsd ? Number(req.body.promoPriceUsd).toFixed(2) : null;
    }
    if (req.body?.stockStatus) {
      updates.stockStatus = String(req.body.stockStatus);
    }

    await db.update(productVariants).set(updates).where(eq(productVariants.id, id));
    await logAudit(req.profile!.id, 'variant_updated', 'product_variant', String(id), updates, req.ip);
    res.json({ ok: true });
  } catch (error) {
    console.error('Update variant error:', error);
    res.status(500).json({ error: 'Erreur mise à jour tarif' });
  }
});

app.post('/api/admin/exchange-rate', requireAuth, requirePermission('rates:update'), async (req: AuthRequest, res) => {
  try {
    const newRate = Number(req.body?.rate);
    if (!Number.isFinite(newRate) || newRate <= 0) {
      return res.status(400).json({ error: 'Taux de change invalide' });
    }
    const [created] = await db
      .insert(exchangeRates)
      .values({
        baseCurrency: 'USD',
        targetCurrency: 'HTG',
        rate: newRate.toFixed(4),
        updatedBy: req.profile!.id,
      })
      .returning();

    await logAudit(req.profile!.id, 'exchange_rate_updated', 'exchange_rate', String(created.id), { rate: newRate }, req.ip);
    res.json({ rate: Number(created.rate) });
  } catch (error) {
    console.error('Exchange rate update error:', error);
    res.status(500).json({ error: 'Erreur mise à jour taux de change' });
  }
});

app.get('/api/admin/customers', requireAuth, requirePermission('customers:read'), async (_req, res) => {
  try {
    const [users, allRoles] = await Promise.all([
      db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          email: profiles.email,
          phone: profiles.phone,
          roleId: profiles.roleId,
          roleName: roles.name,
          loyaltyPoints: profiles.loyaltyPoints,
          cashierStation: profiles.cashierStation,
          isActive: profiles.isActive,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .innerJoin(roles, eq(profiles.roleId, roles.id))
        .orderBy(desc(profiles.createdAt)),
      db.select().from(roles),
    ]);
    res.json({ customers: users, roles: allRoles });
  } catch (error) {
    console.error('Customers fetch error:', error);
    res.status(500).json({ error: 'Erreur chargement clients' });
  }
});

app.patch('/api/admin/customers/:id/role', requireAuth, requirePermission('*'), async (req: AuthRequest, res) => {
  try {
    const targetId = Number(req.params.id);
    const roleId = Number(req.body?.roleId);
    await db.update(profiles).set({ roleId, updatedAt: new Date() }).where(eq(profiles.id, targetId));
    await logAudit(req.profile!.id, 'role_changed', 'profile', String(targetId), { roleId }, req.ip);
    res.json({ ok: true });
  } catch (error) {
    console.error('Role update error:', error);
    res.status(500).json({ error: 'Erreur mise à jour rôle' });
  }
});

app.get('/api/admin/promotions', requireAuth, requirePermission('promotions:manage'), async (_req, res) => {
  try {
    const [promos, coups] = await Promise.all([
      db.select().from(promotions).orderBy(desc(promotions.id)),
      db.select().from(coupons).orderBy(desc(coupons.id)),
    ]);
    res.json({ promotions: promos, coupons: coups });
  } catch (error) {
    console.error('Admin promotions error:', error);
    res.status(500).json({ error: 'Erreur chargement promotions' });
  }
});

app.post('/api/admin/coupons', requireAuth, requirePermission('promotions:manage'), async (req: AuthRequest, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const discountType = req.body?.discountType === 'fixed_usd' ? 'fixed_usd' : 'percent';
    const discountValue = Number(req.body?.discountValue || 10);
    const minOrderUsd = Number(req.body?.minOrderUsd || 0);
    if (!code || discountValue <= 0) {
      return res.status(400).json({ error: 'Code et valeur de réduction requis.' });
    }
    const [created] = await db
      .insert(coupons)
      .values({
        code,
        discountType,
        discountValue: discountValue.toFixed(2),
        minOrderUsd: minOrderUsd.toFixed(2),
        isActive: true,
      })
      .returning();
    await logAudit(req.profile!.id, 'coupon_created', 'coupon', code, { discountType, discountValue }, req.ip);
    res.status(201).json({ coupon: created });
  } catch (error) {
    console.error('Coupon create error:', error);
    res.status(500).json({ error: 'Erreur création coupon' });
  }
});

app.patch('/api/admin/tickets/:id', requireAuth, requirePermission('tickets:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || 'in_progress');
    const adminReply = String(req.body?.adminReply || '').trim();
    const [updated] = await db
      .update(supportTickets)
      .set({ status, adminReply, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();

    if (updated) {
      await dispatchNotification({
        userId: updated.userId,
        orderId: updated.orderId,
        eventType: 'ticket_reply',
        title: `Réponse support — ${updated.ticketRef}`,
        message: adminReply || `Statut du ticket mis à jour : ${status}`,
      });
    }
    res.json({ ticket: updated });
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ error: 'Erreur mise à jour ticket' });
  }
});

app.get('/api/admin/audit-logs', requireAuth, requirePermission('orders:read_all'), async (_req, res) => {
  try {
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    res.json({ logs });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ error: 'Erreur chargement journal d’audit' });
  }
});

app.patch('/api/admin/settings', requireAuth, requirePermission('products:manage'), async (req: AuthRequest, res) => {
  try {
    const updates = req.body as Record<string, string>;
    const secretKeys = new Set([
      'moncash_client_id',
      'moncash_client_secret',
      'moncash_webhook_secret',
      'natcash_api_key',
      'natcash_api_secret',
      'natcash_webhook_secret',
    ]);
    for (const [key, rawValue] of Object.entries(updates)) {
      const value = String(rawValue ?? '').trim();
      const isSecret = secretKeys.has(key);
      if (isSecret && !value) continue;
      await upsertSetting(key, isSecret ? encryptSecret(value) : value, isSecret);
    }
    await logAudit(req.profile!.id, 'settings_updated', 'system_settings', 'batch', { keys: Object.keys(updates) }, req.ip);
    res.json({ ok: true });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Erreur mise à jour paramètres' });
  }
});

app.get('/api/admin/payment-gateways', requireAuth, requirePermission('products:manage'), async (req, res) => {
  try {
    const settingsMap = await getSettingsMap();
    const gateways = getPaymentGatewaysState(settingsMap);
    const hostProto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || '';
    const webhookEndpoint = hostHeader
      ? `${hostProto}://${hostHeader}/api/webhooks/payment`
      : '/api/webhooks/payment';

    res.json({
      webhookEndpoint,
      moncash: {
        merchantNumber: gateways.moncash.merchantNumber,
        merchantCode: gateways.moncash.merchantCode,
        merchantName: gateways.moncash.merchantName,
        feePercent: gateways.moncash.feePercent,
        env: gateways.moncash.env,
        verificationMode: gateways.moncash.verificationMode,
        apiUrl: gateways.moncash.apiUrl,
        hasClientId: gateways.moncash.hasClientId,
        hasClientSecret: gateways.moncash.hasClientSecret,
        hasWebhookSecret: gateways.moncash.hasWebhookSecret,
        maskedClientId: gateways.moncash.maskedClientId,
        maskedClientSecret: gateways.moncash.maskedClientSecret,
        maskedWebhookSecret: gateways.moncash.maskedWebhookSecret,
        autoApiConfigured: gateways.moncash.autoApiConfigured,
        autoApiActive: gateways.moncash.autoApiActive,
        lastTestStatus: gateways.moncash.lastTestStatus,
        lastTestMessage: gateways.moncash.lastTestMessage,
      },
      natcash: {
        merchantNumber: gateways.natcash.merchantNumber,
        merchantCode: gateways.natcash.merchantCode,
        merchantId: gateways.natcash.merchantId,
        merchantName: gateways.natcash.merchantName,
        feePercent: gateways.natcash.feePercent,
        env: gateways.natcash.env,
        verificationMode: gateways.natcash.verificationMode,
        apiUrl: gateways.natcash.apiUrl,
        hasApiKey: gateways.natcash.hasApiKey,
        hasApiSecret: gateways.natcash.hasApiSecret,
        hasWebhookSecret: gateways.natcash.hasWebhookSecret,
        maskedApiKey: gateways.natcash.maskedApiKey,
        maskedApiSecret: gateways.natcash.maskedApiSecret,
        maskedWebhookSecret: gateways.natcash.maskedWebhookSecret,
        autoApiConfigured: gateways.natcash.autoApiConfigured,
        autoApiActive: gateways.natcash.autoApiActive,
        lastTestStatus: gateways.natcash.lastTestStatus,
        lastTestMessage: gateways.natcash.lastTestMessage,
      },
    });
  } catch (error) {
    console.error('Get payment gateways error:', error);
    res.status(500).json({ error: 'Erreur chargement configuration MonCash & NatCash' });
  }
});

app.put('/api/admin/payment-gateways', requireAuth, requirePermission('products:manage'), async (req: AuthRequest, res) => {
  try {
    const { moncash, natcash } = req.body || {};

    if (moncash && typeof moncash === 'object') {
      if (moncash.merchantNumber !== undefined) {
        await upsertSetting('moncash_merchant_number', String(moncash.merchantNumber).trim(), false, 'Numéro marchand MonCash');
      }
      if (moncash.merchantCode !== undefined) {
        await upsertSetting('moncash_merchant_code', String(moncash.merchantCode).trim(), false, 'Code marchand / USSD MonCash');
      }
      if (moncash.merchantName !== undefined) {
        await upsertSetting('moncash_merchant_name', String(moncash.merchantName).trim(), false, 'Nom du compte MonCash');
      }
      if (moncash.feePercent !== undefined) {
        const fee = Math.max(0, Math.min(25, Number(moncash.feePercent) || 0));
        await upsertSetting('moncash_fee_percent', fee.toFixed(2), false, 'Frais passerelle MonCash (%)');
      }
      if (moncash.env !== undefined) {
        const envVal = moncash.env === 'production' ? 'production' : 'sandbox';
        await upsertSetting('moncash_env', envVal, false, 'Environnement MonCash');
      }
      if (moncash.verificationMode !== undefined) {
        const modeVal = moncash.verificationMode === 'auto_api' ? 'auto_api' : 'manual';
        await upsertSetting('moncash_verification_mode', modeVal, false, 'Mode validation MonCash');
      }
      if (moncash.apiUrl !== undefined) {
        await upsertSetting('moncash_api_url', String(moncash.apiUrl).trim(), false, 'URL API MonCash');
      }

      if (moncash.clearSecrets) {
        await upsertSetting('moncash_client_id', '', true, 'MonCash Client ID chiffré');
        await upsertSetting('moncash_client_secret', '', true, 'MonCash Client Secret chiffré');
        await upsertSetting('moncash_webhook_secret', '', true, 'MonCash Webhook Secret chiffré');
      } else {
        if (typeof moncash.clientId === 'string' && moncash.clientId.trim()) {
          await upsertSetting('moncash_client_id', encryptSecret(moncash.clientId.trim()), true, 'MonCash Client ID chiffré');
        }
        if (typeof moncash.clientSecret === 'string' && moncash.clientSecret.trim()) {
          await upsertSetting('moncash_client_secret', encryptSecret(moncash.clientSecret.trim()), true, 'MonCash Client Secret chiffré');
        }
        if (typeof moncash.webhookSecret === 'string' && moncash.webhookSecret.trim()) {
          await upsertSetting('moncash_webhook_secret', encryptSecret(moncash.webhookSecret.trim()), true, 'MonCash Webhook Secret chiffré');
        }
      }
    }

    if (natcash && typeof natcash === 'object') {
      if (natcash.merchantNumber !== undefined) {
        await upsertSetting('natcash_merchant_number', String(natcash.merchantNumber).trim(), false, 'Numéro marchand NatCash');
      }
      if (natcash.merchantCode !== undefined) {
        await upsertSetting('natcash_merchant_code', String(natcash.merchantCode).trim(), false, 'Code marchand / USSD NatCash');
      }
      if (natcash.merchantId !== undefined) {
        await upsertSetting('natcash_merchant_id', String(natcash.merchantId).trim(), false, 'Merchant ID API NatCash');
      }
      if (natcash.merchantName !== undefined) {
        await upsertSetting('natcash_merchant_name', String(natcash.merchantName).trim(), false, 'Nom du compte NatCash');
      }
      if (natcash.feePercent !== undefined) {
        const fee = Math.max(0, Math.min(25, Number(natcash.feePercent) || 0));
        await upsertSetting('natcash_fee_percent', fee.toFixed(2), false, 'Frais passerelle NatCash (%)');
      }
      if (natcash.env !== undefined) {
        const envVal = natcash.env === 'production' ? 'production' : 'sandbox';
        await upsertSetting('natcash_env', envVal, false, 'Environnement NatCash');
      }
      if (natcash.verificationMode !== undefined) {
        const modeVal = natcash.verificationMode === 'auto_api' ? 'auto_api' : 'manual';
        await upsertSetting('natcash_verification_mode', modeVal, false, 'Mode validation NatCash');
      }
      if (natcash.apiUrl !== undefined) {
        await upsertSetting('natcash_api_url', String(natcash.apiUrl).trim(), false, 'URL API NatCash');
      }

      if (natcash.clearSecrets) {
        await upsertSetting('natcash_api_key', '', true, 'NatCash API Key chiffrée');
        await upsertSetting('natcash_api_secret', '', true, 'NatCash API Secret chiffrée');
        await upsertSetting('natcash_webhook_secret', '', true, 'NatCash Webhook Secret chiffré');
      } else {
        if (typeof natcash.apiKey === 'string' && natcash.apiKey.trim()) {
          await upsertSetting('natcash_api_key', encryptSecret(natcash.apiKey.trim()), true, 'NatCash API Key chiffrée');
        }
        if (typeof natcash.apiSecret === 'string' && natcash.apiSecret.trim()) {
          await upsertSetting('natcash_api_secret', encryptSecret(natcash.apiSecret.trim()), true, 'NatCash API Secret chiffrée');
        }
        if (typeof natcash.webhookSecret === 'string' && natcash.webhookSecret.trim()) {
          await upsertSetting('natcash_webhook_secret', encryptSecret(natcash.webhookSecret.trim()), true, 'NatCash Webhook Secret chiffré');
        }
      }
    }

    await logAudit(
      req.profile!.id,
      'payment_gateways_updated',
      'system_settings',
      'moncash_natcash',
      { updatedMoncash: Boolean(moncash), updatedNatcash: Boolean(natcash) },
      req.ip
    );

    const updatedMap = await getSettingsMap();
    const updatedState = getPaymentGatewaysState(updatedMap);
    res.json({
      ok: true,
      moncash: {
        autoApiConfigured: updatedState.moncash.autoApiConfigured,
        autoApiActive: updatedState.moncash.autoApiActive,
      },
      natcash: {
        autoApiConfigured: updatedState.natcash.autoApiConfigured,
        autoApiActive: updatedState.natcash.autoApiActive,
      },
    });
  } catch (error) {
    console.error('Update payment gateways error:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde MonCash / NatCash' });
  }
});

app.post('/api/admin/payment-gateways/:gateway/test', requireAuth, requirePermission('products:manage'), async (req: AuthRequest, res) => {
  try {
    const gateway = req.params.gateway === 'natcash' ? 'natcash' : 'moncash';
    const settingsMap = await getSettingsMap();
    const state = getPaymentGatewaysState(settingsMap);

    if (gateway === 'moncash') {
      const { clientId, clientSecret, apiUrl } = state.moncash;
      if (!clientId || !clientSecret || !apiUrl) {
        const msg = 'Client ID et Client Secret MonCash non encore configurés. Le mode manuel reste actif sans blocage.';
        await upsertSetting('moncash_last_test_status', 'not_configured', false, 'Statut test MonCash');
        await upsertSetting('moncash_last_test_message', msg, false, 'Message test MonCash');
        return res.json({ ok: false, configured: false, status: 'not_configured', message: msg });
      }

      const tokenEndpoint = `${apiUrl.replace(/\/+$/, '')}/oauth/token`;
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      try {
        const resp = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: 'scope=read,write&grant_type=client_credentials',
          signal: AbortSignal.timeout(8000),
        });
        if (resp.ok) {
          const msg = `Connexion OAuth MonCash (${state.moncash.env}) réussie (HTTP ${resp.status}).`;
          await upsertSetting('moncash_last_test_status', 'success', false, 'Statut test MonCash');
          await upsertSetting('moncash_last_test_message', msg, false, 'Message test MonCash');
          await logAudit(req.profile!.id, 'gateway_test_success', 'payment_gateway', 'moncash', { status: resp.status }, req.ip);
          return res.json({ ok: true, configured: true, status: 'success', message: msg });
        }
        const errBody = await resp.text();
        const msg = `Réponse MonCash HTTP ${resp.status} — Vérifiez Client ID / Secret ou URL (${errBody.slice(0, 120)})`;
        await upsertSetting('moncash_last_test_status', 'error', false, 'Statut test MonCash');
        await upsertSetting('moncash_last_test_message', msg, false, 'Message test MonCash');
        return res.json({ ok: false, configured: true, status: 'error', message: msg });
      } catch (err: unknown) {
        const msg = `Échec réseau MonCash : ${err instanceof Error ? err.message : 'Hôte inaccessible'}`;
        await upsertSetting('moncash_last_test_status', 'error', false, 'Statut test MonCash');
        await upsertSetting('moncash_last_test_message', msg, false, 'Message test MonCash');
        return res.json({ ok: false, configured: true, status: 'error', message: msg });
      }
    }

    // NatCash test
    const { apiUrl, apiKey, merchantId, merchantCode } = state.natcash;
    if (!apiUrl || !apiKey || (!merchantId && !merchantCode)) {
      const msg = 'URL API, Merchant ID ou API Key NatCash non encore configurés. Le mode manuel reste actif sans blocage.';
      await upsertSetting('natcash_last_test_status', 'not_configured', false, 'Statut test NatCash');
      await upsertSetting('natcash_last_test_message', msg, false, 'Message test NatCash');
      return res.json({ ok: false, configured: false, status: 'not_configured', message: msg });
    }

    try {
      const resp = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'x-merchant-id': merchantId || merchantCode,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok || resp.status === 401 || resp.status === 403 || resp.status === 405) {
        const isAuthOk = resp.ok;
        const status = isAuthOk ? 'success' : 'error';
        const msg = isAuthOk
          ? `Passerelle NatCash joignable et authentifiée (HTTP ${resp.status}).`
          : `Serveur NatCash joignable (HTTP ${resp.status}) — Vérifiez votre API Key / Merchant ID.`;
        await upsertSetting('natcash_last_test_status', status, false, 'Statut test NatCash');
        await upsertSetting('natcash_last_test_message', msg, false, 'Message test NatCash');
        return res.json({ ok: isAuthOk, configured: true, status, message: msg });
      }
      const msg = `Réponse NatCash HTTP ${resp.status}`;
      await upsertSetting('natcash_last_test_status', 'error', false, 'Statut test NatCash');
      await upsertSetting('natcash_last_test_message', msg, false, 'Message test NatCash');
      return res.json({ ok: false, configured: true, status: 'error', message: msg });
    } catch (err: unknown) {
      const msg = `Échec réseau NatCash : ${err instanceof Error ? err.message : 'Hôte inaccessible'}`;
      await upsertSetting('natcash_last_test_status', 'error', false, 'Statut test NatCash');
      await upsertSetting('natcash_last_test_message', msg, false, 'Message test NatCash');
      return res.json({ ok: false, configured: true, status: 'error', message: msg });
    }
  } catch (error) {
    console.error('Payment gateway test error:', error);
    res.status(500).json({ error: 'Erreur lors du test de passerelle' });
  }
});

app.get('/api/admin/exchange-rates', requireAuth, requirePermission('orders:read_all'), async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: exchangeRates.id,
        baseCurrency: exchangeRates.baseCurrency,
        targetCurrency: exchangeRates.targetCurrency,
        rate: exchangeRates.rate,
        createdAt: exchangeRates.createdAt,
        updatedByName: profiles.fullName,
      })
      .from(exchangeRates)
      .leftJoin(profiles, eq(exchangeRates.updatedBy, profiles.id))
      .orderBy(desc(exchangeRates.createdAt))
      .limit(30);
    res.json({ rates: rows });
  } catch (error) {
    console.error('Exchange rates list error:', error);
    res.status(500).json({ error: 'Erreur chargement historique taux' });
  }
});

app.get('/api/admin/refunds', requireAuth, requirePermission('orders:read_all'), async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: refunds.id,
        orderId: refunds.orderId,
        orderRef: orders.orderRef,
        customerName: profiles.fullName,
        customerEmail: profiles.email,
        amount: refunds.amount,
        currency: refunds.currency,
        reason: refunds.reason,
        status: refunds.status,
        createdAt: refunds.createdAt,
        processedAt: refunds.processedAt,
      })
      .from(refunds)
      .innerJoin(orders, eq(refunds.orderId, orders.id))
      .innerJoin(profiles, eq(refunds.userId, profiles.id))
      .orderBy(desc(refunds.createdAt))
      .limit(100);
    res.json({ refunds: rows });
  } catch (error) {
    console.error('Admin refunds list error:', error);
    res.status(500).json({ error: 'Erreur chargement remboursements' });
  }
});

app.patch('/api/admin/products/:id', requireAuth, requirePermission('products:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const updates: Record<string, unknown> = {};
    if (req.body?.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);
    if (req.body?.isPopular !== undefined) updates.isPopular = Boolean(req.body.isPopular);
    if (req.body?.isNew !== undefined) updates.isNew = Boolean(req.body.isNew);
    if (req.body?.isPromo !== undefined) updates.isPromo = Boolean(req.body.isPromo);
    if (req.body?.marginPercent !== undefined) updates.marginPercent = Number(req.body.marginPercent).toFixed(2);
    if (req.body?.compatibleRegions) updates.compatibleRegions = String(req.body.compatibleRegions).trim();
    if (req.body?.deliveryTimeLabel) updates.deliveryTimeLabel = String(req.body.deliveryTimeLabel).trim();

    await db.update(products).set(updates).where(eq(products.id, id));
    await logAudit(req.profile!.id, 'product_updated', 'product', String(id), updates, req.ip);
    res.json({ ok: true });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Erreur mise à jour produit' });
  }
});

app.post('/api/admin/categories', requireAuth, requirePermission('products:manage'), async (req: AuthRequest, res) => {
  try {
    const nameFr = String(req.body?.nameFr || '').trim();
    const type = req.body?.type === 'gaming_topup' ? 'gaming_topup' : 'gift_card';
    const descriptionFr = String(req.body?.descriptionFr || nameFr).trim();
    if (!nameFr) return res.status(400).json({ error: 'Nom catégorie requis.' });
    const slug = `${nameFr}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const [created] = await db
      .insert(categories)
      .values({
        slug,
        type,
        nameFr,
        nameEs: String(req.body?.nameEs || nameFr),
        nameEn: String(req.body?.nameEn || nameFr),
        descriptionFr,
        descriptionEs: descriptionFr,
        descriptionEn: descriptionFr,
        imageUrl:
          type === 'gift_card'
            ? '/src/assets/images/cat_gift_cards_1795058562137.jpg'
            : '/src/assets/images/cat_gaming_topup_1795058562435.jpg',
      })
      .returning();
    await logAudit(req.profile!.id, 'category_created', 'category', slug, { nameFr }, req.ip);
    res.status(201).json({ category: created });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Erreur création catégorie' });
  }
});

app.post('/api/admin/promotions', requireAuth, requirePermission('promotions:manage'), async (req: AuthRequest, res) => {
  try {
    const titleFr = String(req.body?.titleFr || '').trim();
    const descriptionFr = String(req.body?.descriptionFr || titleFr).trim();
    const discountPercent = Number(req.body?.discountPercent || 10);
    if (!titleFr || discountPercent <= 0) {
      return res.status(400).json({ error: 'Titre et pourcentage requis.' });
    }
    const [created] = await db
      .insert(promotions)
      .values({
        titleFr,
        titleEs: String(req.body?.titleEs || titleFr),
        titleEn: String(req.body?.titleEn || titleFr),
        descriptionFr,
        descriptionEs: descriptionFr,
        descriptionEn: descriptionFr,
        discountPercent: discountPercent.toFixed(2),
        productId: req.body?.productId ? Number(req.body.productId) : null,
        isActive: true,
      })
      .returning();
    await logAudit(req.profile!.id, 'promotion_created', 'promotion', String(created.id), { titleFr, discountPercent }, req.ip);
    res.status(201).json({ promotion: created });
  } catch (error) {
    console.error('Create promotion error:', error);
    res.status(500).json({ error: 'Erreur création promotion' });
  }
});

app.patch('/api/admin/promotions/:id', requireAuth, requirePermission('promotions:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db
      .update(promotions)
      .set({ isActive: Boolean(req.body?.isActive) })
      .where(eq(promotions.id, id));
    res.json({ ok: true });
  } catch (error) {
    console.error('Toggle promotion error:', error);
    res.status(500).json({ error: 'Erreur mise à jour promotion' });
  }
});

app.patch('/api/admin/coupons/:id', requireAuth, requirePermission('promotions:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db
      .update(coupons)
      .set({ isActive: Boolean(req.body?.isActive) })
      .where(eq(coupons.id, id));
    res.json({ ok: true });
  } catch (error) {
    console.error('Toggle coupon error:', error);
    res.status(500).json({ error: 'Erreur mise à jour coupon' });
  }
});

app.patch('/api/admin/supplier-products/:id/map', requireAuth, requirePermission('suppliers:manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const productVariantId = req.body?.productVariantId ? Number(req.body.productVariantId) : null;
    await db
      .update(supplierProducts)
      .set({ productVariantId })
      .where(eq(supplierProducts.id, id));
    await logAudit(req.profile!.id, 'supplier_product_mapped', 'supplier_product', String(id), { productVariantId }, req.ip);
    res.json({ ok: true });
  } catch (error) {
    console.error('Map supplier product error:', error);
    res.status(500).json({ error: 'Erreur correspondance produit fournisseur' });
  }
});

// ==========================================
// ADMIN CASHIER MANAGEMENT
// ==========================================
app.get('/api/admin/cashiers', requireAuth, requirePermission('customers:read'), async (_req, res) => {
  try {
    const [allStaff, allOrders, allPayments] = await Promise.all([
      db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          email: profiles.email,
          phone: profiles.phone,
          roleName: roles.name,
          cashierStation: profiles.cashierStation,
          isActive: profiles.isActive,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .innerJoin(roles, eq(profiles.roleId, roles.id))
        .where(eq(roles.name, 'cashier'))
        .orderBy(desc(profiles.createdAt)),
      db.select().from(orders),
      db.select().from(payments),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const cashiersWithStats = allStaff.map((c) => {
      const verifiedOrderIds = new Set(
        allPayments.filter((p) => p.verifiedBy === c.id && p.status === 'verified').map((p) => p.orderId)
      );
      const handledOrders = allOrders.filter((o) => o.cashierId === c.id || verifiedOrderIds.has(o.id));
      const todayHandled = handledOrders.filter((o) => new Date(o.createdAt) >= todayStart);
      return {
        ...c,
        totalOrdersCount: handledOrders.length,
        todayOrdersCount: todayHandled.length,
        totalCollectedUsd: handledOrders.reduce((acc, o) => acc + Number(o.totalUsd), 0),
        totalCollectedHtg: handledOrders.reduce((acc, o) => acc + Number(o.totalHtg), 0),
        todayCollectedHtg: todayHandled.reduce((acc, o) => acc + Number(o.totalHtg), 0),
      };
    });

    res.json({ cashiers: cashiersWithStats });
  } catch (error) {
    console.error('Admin cashiers fetch error:', error);
    res.status(500).json({ error: 'Erreur chargement des caissiers' });
  }
});

app.post('/api/admin/cashiers', requireAuth, requirePermission('*'), async (req: AuthRequest, res) => {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '');
    const cashierStation = String(req.body?.cashierStation || 'Guichet Principal').trim();

    if (!fullName || !email || password.length < 8) {
      return res.status(400).json({ error: 'Nom complet, email valide et mot de passe (min 8 car.) requis.' });
    }

    const cashierRoleRows = await db.select().from(roles).where(eq(roles.name, 'cashier')).limit(1);
    const cashierRole = cashierRoleRows[0];
    if (!cashierRole) {
      return res.status(500).json({ error: 'Rôle caissier introuvable' });
    }

    const existing = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
    if (existing[0]) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });
    }

    const [created] = await db
      .insert(profiles)
      .values({
        fullName,
        email,
        phone: phone || null,
        passwordHash: hashPassword(password),
        roleId: cashierRole.id,
        cashierStation,
        preferredLang: 'fr',
        preferredCurrency: 'HTG',
        isActive: true,
      })
      .returning();

    await logAudit(req.profile!.id, 'cashier_created', 'profile', String(created.id), { email, cashierStation }, req.ip);
    res.status(201).json({ cashier: created });
  } catch (error) {
    console.error('Create cashier error:', error);
    res.status(500).json({ error: 'Erreur création du compte caissier' });
  }
});

app.patch('/api/admin/customers/:id/status', requireAuth, requirePermission('*'), async (req: AuthRequest, res) => {
  try {
    const targetId = Number(req.params.id);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof req.body?.isActive === 'boolean') updates.isActive = req.body.isActive;
    if (req.body?.cashierStation !== undefined) updates.cashierStation = String(req.body.cashierStation || '').trim() || null;

    await db.update(profiles).set(updates).where(eq(profiles.id, targetId));
    await logAudit(req.profile!.id, 'profile_status_updated', 'profile', String(targetId), updates, req.ip);
    res.json({ ok: true });
  } catch (error) {
    console.error('Update customer status error:', error);
    res.status(500).json({ error: 'Erreur mise à jour statut utilisateur' });
  }
});

// ==========================================
// DEDICATED CASHIER PORTAL API
// ==========================================
app.get('/api/cashier/dashboard', requireAuth, requirePermission('cashier:pos'), async (req: AuthRequest, res) => {
  try {
    const [rate, recentOrders, customerRows] = await Promise.all([
      getCurrentExchangeRate(),
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(150),
      db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          email: profiles.email,
          phone: profiles.phone,
        })
        .from(profiles)
        .orderBy(desc(profiles.createdAt))
        .limit(80),
    ]);

    const enriched = await Promise.all(
      recentOrders.map(async (ord) => {
        const [cust, items, pms] = await Promise.all([
          db
            .select({ fullName: profiles.fullName, email: profiles.email, phone: profiles.phone })
            .from(profiles)
            .where(eq(profiles.id, ord.userId))
            .limit(1),
          db.select().from(orderItems).where(eq(orderItems.orderId, ord.id)),
          db.select().from(payments).where(eq(payments.orderId, ord.id)),
        ]);
        return {
          ...ord,
          customer: cust[0] ?? null,
          items,
          payments: pms,
        };
      })
    );

    const pendingQueue = enriched.filter((o) =>
      ['pending_payment', 'payment_verifying', 'paid', 'processing'].includes(o.status)
    );

    const myOrders = enriched.filter(
      (o) =>
        o.cashierId === req.profile!.id ||
        o.payments.some((p) => p.verifiedBy === req.profile!.id)
    );

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const myTodayOrders = myOrders.filter(
      (o) => new Date(o.createdAt) >= todayStart && !['failed', 'cancelled', 'refunded'].includes(o.status)
    );

    const shiftSummary = {
      todayCount: myTodayOrders.length,
      todayTotalUsd: myTodayOrders.reduce((s, o) => s + Number(o.totalUsd), 0),
      todayTotalHtg: myTodayOrders.reduce((s, o) => s + Number(o.totalHtg), 0),
      cashHtg: myTodayOrders
        .filter((o) => o.paymentMethod === 'cash' && o.currency === 'HTG')
        .reduce((s, o) => s + Number(o.totalHtg), 0),
      cashUsd: myTodayOrders
        .filter((o) => o.paymentMethod === 'cash' && o.currency === 'USD')
        .reduce((s, o) => s + Number(o.totalUsd), 0),
      moncashUsd: myTodayOrders
        .filter((o) => o.paymentMethod === 'moncash')
        .reduce((s, o) => s + Number(o.totalUsd), 0),
      natcashUsd: myTodayOrders
        .filter((o) => o.paymentMethod === 'natcash')
        .reduce((s, o) => s + Number(o.totalUsd), 0),
    };

    res.json({
      station: req.profile!.cashierStation || 'Guichet KAL-SU',
      exchangeRate: rate,
      pendingQueue,
      myOrders: myOrders.slice(0, 50),
      shiftSummary,
      customers: customerRows,
    });
  } catch (error) {
    console.error('Cashier dashboard error:', error);
    res.status(500).json({ error: 'Erreur chargement espace caissier' });
  }
});

app.post('/api/cashier/pos-order', requireAuth, requirePermission('cashier:pos'), async (req: AuthRequest, res) => {
  try {
    const variantId = Number(req.body?.variantId);
    const quantity = Math.max(1, Math.min(20, Number(req.body?.quantity || 1)));
    const currency = req.body?.currency === 'USD' ? 'USD' : 'HTG';
    const paymentMethodRaw = String(req.body?.paymentMethod || 'cash');
    const paymentMethod =
      paymentMethodRaw === 'moncash' ? 'moncash' : paymentMethodRaw === 'natcash' ? 'natcash' : 'cash';
    const customerId = req.body?.customerId ? Number(req.body.customerId) : req.profile!.id;
    const customerDisplayName = String(req.body?.customerDisplayName || '').trim() || 'Client Comptoir';
    const customerDisplayPhone = String(req.body?.customerDisplayPhone || '').trim() || null;
    const playerId = String(req.body?.playerId || '').trim() || null;
    const playerIdConfirmed = String(req.body?.playerIdConfirmed || '').trim() || null;
    const deliveryCodeOrReceipt = String(req.body?.deliveryCodeOrReceipt || '').trim();
    const deliveryNotes = String(req.body?.deliveryNotes || '').trim();
    let transactionRef = String(req.body?.transactionRef || '').trim();

    if (!variantId) {
      return res.status(400).json({ error: 'Sélectionnez un produit / forfait valide.' });
    }

    const variantRows = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);
    const variant = variantRows[0];
    if (!variant || !variant.isActive) {
      return res.status(404).json({ error: 'Forfait introuvable ou indisponible.' });
    }

    const productRows = await db
      .select()
      .from(products)
      .where(eq(products.id, variant.productId))
      .limit(1);
    const product = productRows[0];
    if (!product) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    if (product.requiresPlayerId) {
      if (!playerId || !playerIdConfirmed || playerId !== playerIdConfirmed) {
        return res.status(400).json({ error: 'Le Player ID et sa confirmation doivent correspondre.' });
      }
    }

    if (paymentMethod !== 'cash' && !transactionRef) {
      return res.status(400).json({ error: 'Référence de transaction MonCash / NatCash requise.' });
    }
    if (!transactionRef) {
      transactionRef = `CAISSE-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    }

    const dupRef = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.transactionRef, transactionRef))
      .limit(1);
    if (dupRef[0]) {
      return res.status(409).json({ error: 'Cette référence de paiement a déjà été enregistrée.' });
    }

    const [rate, settingsMap] = await Promise.all([getCurrentExchangeRate(), getSettingsMap()]);
    const unitUsd = Number(variant.promoPriceUsd || variant.sellingPriceUsd);
    const subtotalUsd = unitUsd * quantity;
    const feePct =
      paymentMethod === 'cash'
        ? 0
        : paymentMethod === 'moncash'
        ? Number(settingsMap.moncash_fee_percent ?? 0)
        : Number(settingsMap.natcash_fee_percent ?? 0);
    const paymentFeeUsd = Number(((subtotalUsd * feePct) / 100).toFixed(2));
    const totalUsd = Number((subtotalUsd + paymentFeeUsd).toFixed(2));
    const totalHtg = Number((totalUsd * rate).toFixed(2));
    const supplierCostUsd = Number((Number(variant.supplierCostUsd) * quantity).toFixed(2));
    const estimatedProfitUsd = Number((subtotalUsd - supplierCostUsd).toFixed(2));

    const orderRef = `KSG-POS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const idempotencyKey = `pos-${req.profile!.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const isDeliveredNow = Boolean(deliveryCodeOrReceipt);
    const [createdOrder] = await db
      .insert(orders)
      .values({
        orderRef,
        idempotencyKey,
        userId: customerId,
        cashierId: req.profile!.id,
        orderChannel: 'cashier_pos',
        customerDisplayName,
        customerDisplayPhone,
        status: isDeliveredNow ? 'delivered' : 'paid',
        currency,
        exchangeRateUsed: rate.toFixed(4),
        subtotalUsd: subtotalUsd.toFixed(2),
        discountUsd: '0.00',
        paymentFeeUsd: paymentFeeUsd.toFixed(2),
        totalUsd: totalUsd.toFixed(2),
        totalHtg: totalHtg.toFixed(2),
        supplierCostUsd: supplierCostUsd.toFixed(2),
        estimatedProfitUsd: estimatedProfitUsd.toFixed(2),
        paymentMethod,
        playerId,
        playerIdConfirmed,
        deliveryPayload: isDeliveredNow
          ? {
              mode: 'cashier_pos',
              codeOrReceipt: deliveryCodeOrReceipt,
              notes: deliveryNotes || `Livré au guichet par ${req.profile!.fullName}`,
              deliveredAt: new Date().toISOString(),
            }
          : null,
      })
      .returning();

    await db.insert(orderItems).values({
      orderId: createdOrder.id,
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      variantLabel: variant.label,
      quantity,
      unitPriceUsd: unitUsd.toFixed(2),
      supplierCostUsd: Number(variant.supplierCostUsd).toFixed(2),
      regionCode: product.compatibleRegions,
    });

    const merchantNumber =
      paymentMethod === 'moncash'
        ? settingsMap.moncash_merchant_number || '+509 3700-0000'
        : paymentMethod === 'natcash'
        ? settingsMap.natcash_merchant_number || '+509 4100-0000'
        : req.profile!.cashierStation || 'Guichet Espèces';

    await db.insert(payments).values({
      orderId: createdOrder.id,
      userId: customerId,
      method: paymentMethod,
      merchantNumber,
      transactionRef,
      amount: currency === 'HTG' ? totalHtg.toFixed(2) : totalUsd.toFixed(2),
      currency,
      status: 'verified',
      verificationMode: 'cashier_pos',
      verifiedBy: req.profile!.id,
      verifiedAt: new Date(),
    });

    let dispatchResult = null;
    if (!isDeliveredNow) {
      dispatchResult = await dispatchOrderToSupplier(createdOrder.id);
    }

    await logAudit(
      req.profile!.id,
      'cashier_pos_order_created',
      'order',
      createdOrder.orderRef,
      { paymentMethod, totalUsd, totalHtg, station: req.profile!.cashierStation, customerDisplayName },
      req.ip
    );

    res.status(201).json({ order: createdOrder, transactionRef, dispatchResult });
  } catch (error) {
    console.error('Cashier POS order error:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la vente guichet' });
  }
});

// ==========================================
// SERVER BOOTSTRAP (VITE DEV / PROD STATIC)
// ==========================================
const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      try {
        const htmlPath = path.resolve(process.cwd(), 'index.html');
        const rawHtml = fs.readFileSync(htmlPath, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (e) {
        next(e);
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`KAL-SU GIFT server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
