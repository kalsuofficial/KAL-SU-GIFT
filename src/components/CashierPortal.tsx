import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Check,
  Clock,
  CreditCard,
  Download,
  Lock,
  LogOut,
  PackageCheck,
  Receipt,
  RefreshCw,
  Search,
  Shield,
  Store,
  UserCheck,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo.tsx';
import { formatMoney } from '../i18n/translations.ts';
import type {
  CurrencyCode,
  MerchantConfig,
  OrderRecord,
  Product,
  UserProfile,
} from '../types.ts';

interface CashierPortalProps {
  profile: UserProfile | null;
  products: Product[];
  exchangeRate: number;
  merchantConfig: MerchantConfig;
  getAuthHeader: () => Promise<string | null>;
  onRequireAuth: () => void;
  onNavigate: (path: '/' | '/admin' | '/caissier') => void;
  onLogout: () => void;
  isAdminUser: boolean;
}

interface CashierShiftSummary {
  todayCount: number;
  todayTotalUsd: number;
  todayTotalHtg: number;
  cashHtg: number;
  cashUsd: number;
  moncashUsd: number;
  natcashUsd: number;
}

interface CashierCustomerLite {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
}

export const CashierPortal: React.FC<CashierPortalProps> = ({
  profile,
  products,
  exchangeRate,
  merchantConfig,
  getAuthHeader,
  onRequireAuth,
  onNavigate,
  onLogout,
  isAdminUser,
}) => {
  const hasCashierAccess = Boolean(
    profile &&
      (profile.permissions.includes('*') ||
        profile.permissions.includes('cashier:pos') ||
        profile.permissions.includes('payments:verify'))
  );

  const [tab, setTab] = useState<'pos' | 'queue' | 'journal'>('pos');
  const [station, setStation] = useState(profile?.cashierStation || 'Guichet Central');
  const [pendingQueue, setPendingQueue] = useState<OrderRecord[]>([]);
  const [myOrders, setMyOrders] = useState<OrderRecord[]>([]);
  const [customers, setCustomers] = useState<CashierCustomerLite[]>([]);
  const [shiftSummary, setShiftSummary] = useState<CashierShiftSummary>({
    todayCount: 0,
    todayTotalUsd: 0,
    todayTotalHtg: 0,
    cashHtg: 0,
    cashUsd: 0,
    moncashUsd: 0,
    natcashUsd: 0,
  });
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // POS State
  const [productSearch, setProductSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'gift_card' | 'gaming'>('all');
  const [selectedProductId, setSelectedProductId] = useState<number>(products[0]?.id ?? 0);
  const [selectedVariantId, setSelectedVariantId] = useState<number>(
    products[0]?.variants[0]?.id ?? 0
  );
  const [quantity, setQuantity] = useState(1);
  const [posCurrency, setPosCurrency] = useState<CurrencyCode>('HTG');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'moncash' | 'natcash'>('cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [walkinName, setWalkinName] = useState('Client Comptoir');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [playerIdConfirm, setPlayerIdConfirm] = useState('');
  const [deliveryCodeOrReceipt, setDeliveryCodeOrReceipt] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submittingPos, setSubmittingPos] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{
    orderRef: string;
    totalUsd: string;
    totalHtg: string;
    paymentMethod: string;
    transactionRef: string;
    productName: string;
    variantLabel: string;
    customerDisplayName: string;
  } | null>(null);

  // Queue delivery state
  const [deliveringOrderId, setDeliveringOrderId] = useState<number | null>(null);
  const [queueDeliveryCode, setQueueDeliveryCode] = useState('');
  const [queueDeliveryNotes, setQueueDeliveryNotes] = useState('');

  const loadCashierData = useCallback(async () => {
    if (!hasCashierAccess) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;
      const resp = await fetch('/api/cashier/dashboard', {
        headers: { Authorization: authHeader },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erreur chargement guichet');
      setStation(data.station || 'Guichet KAL-SU');
      setPendingQueue(data.pendingQueue || []);
      setMyOrders(data.myOrders || []);
      setShiftSummary(
        data.shiftSummary || {
          todayCount: 0,
          todayTotalUsd: 0,
          todayTotalHtg: 0,
          cashHtg: 0,
          cashUsd: 0,
          moncashUsd: 0,
          natcashUsd: 0,
        }
      );
      setCustomers(data.customers || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur chargement caisse');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, hasCashierAccess]);

  useEffect(() => {
    loadCashierData();
  }, [loadCashierData]);

  useEffect(() => {
    if (products.length > 0 && !products.some((p) => p.id === selectedProductId)) {
      setSelectedProductId(products[0].id);
      setSelectedVariantId(products[0].variants[0]?.id ?? 0);
    }
  }, [products, selectedProductId]);

  const filteredCatalog = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (typeFilter === 'gift_card' && p.productType !== 'gift_card') return false;
      if (typeFilter === 'gaming' && p.productType === 'gift_card') return false;
      if (q && !`${p.name} ${p.brand} ${p.compatibleRegions}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, productSearch, typeFilter]);

  const activeProduct = products.find((p) => p.id === selectedProductId) || products[0];
  const activeVariant =
    activeProduct?.variants.find((v) => v.id === selectedVariantId) ||
    activeProduct?.variants[0] ||
    null;

  const unitUsd = activeVariant
    ? Number(activeVariant.promoPriceUsd || activeVariant.sellingPriceUsd)
    : 0;
  const subtotalUsd = unitUsd * quantity;
  const feePct =
    paymentMethod === 'cash'
      ? 0
      : paymentMethod === 'moncash'
      ? merchantConfig.moncashFeePercent
      : merchantConfig.natcashFeePercent;
  const feeUsd = Number(((subtotalUsd * feePct) / 100).toFixed(2));
  const totalUsd = Number((subtotalUsd + feeUsd).toFixed(2));
  const totalHtg = Number((totalUsd * exchangeRate).toFixed(2));

  const handleSelectProduct = (prod: Product) => {
    setSelectedProductId(prod.id);
    setSelectedVariantId(prod.variants[0]?.id ?? 0);
    setPlayerId('');
    setPlayerIdConfirm('');
  };

  const handleCreatePosSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct || !activeVariant) return;
    setErrorMsg('');
    setBanner('');

    if (activeProduct.requiresPlayerId && (!playerId.trim() || playerId.trim() !== playerIdConfirm.trim())) {
      setErrorMsg('Le Player ID et sa confirmation doivent être identiques.');
      return;
    }
    if (paymentMethod !== 'cash' && !transactionRef.trim()) {
      setErrorMsg('Saisissez la référence de transaction MonCash / NatCash.');
      return;
    }

    setSubmittingPos(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;
      const resp = await fetch('/api/cashier/pos-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({
          variantId: activeVariant.id,
          quantity,
          currency: posCurrency,
          paymentMethod,
          transactionRef: transactionRef.trim() || undefined,
          customerId: selectedCustomerId ? Number(selectedCustomerId) : undefined,
          customerDisplayName: walkinName.trim() || 'Client Comptoir',
          customerDisplayPhone: walkinPhone.trim() || undefined,
          playerId: playerId.trim() || undefined,
          playerIdConfirmed: playerIdConfirm.trim() || undefined,
          deliveryCodeOrReceipt: deliveryCodeOrReceipt.trim() || undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Échec de l’encaissement');

      setLastReceipt({
        orderRef: data.order.orderRef,
        totalUsd: data.order.totalUsd,
        totalHtg: data.order.totalHtg,
        paymentMethod,
        transactionRef: data.transactionRef,
        productName: activeProduct.name,
        variantLabel: activeVariant.label,
        customerDisplayName: walkinName.trim() || 'Client Comptoir',
      });
      setBanner(`Vente guichet validée : ${data.order.orderRef}`);
      setTransactionRef('');
      setPlayerId('');
      setPlayerIdConfirm('');
      setDeliveryCodeOrReceipt('');
      setDeliveryNotes('');
      setQuantity(1);
      await loadCashierData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur vente guichet');
    } finally {
      setSubmittingPos(false);
    }
  };

  const handleVerifyPayment = async (paymentId: number, action: 'approve' | 'reject') => {
    setErrorMsg('');
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const reason = action === 'reject' ? 'Référence introuvable au guichet' : '';
    const resp = await fetch(`/api/admin/payments/${paymentId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ action, reason }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setErrorMsg(data.error || 'Erreur vérification paiement');
      return;
    }
    setBanner(
      action === 'approve'
        ? `Paiement confirmé. Statut fournisseur : ${data.dispatchResult?.status || 'traité'}`
        : 'Paiement refusé et commande annulée.'
    );
    await loadCashierData();
  };

  const handleDeliverOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveringOrderId) return;
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch(`/api/admin/orders/${deliveringOrderId}/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        codeOrReceipt: queueDeliveryCode,
        notes: queueDeliveryNotes || `Livré par caissier (${station})`,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setErrorMsg(data.error || 'Erreur livraison');
      return;
    }
    setDeliveringOrderId(null);
    setQueueDeliveryCode('');
    setQueueDeliveryNotes('');
    setBanner('Commande marquée livrée.');
    await loadCashierData();
  };

  const handleExportShiftCsv = () => {
    const header = [
      'OrderRef',
      'Date',
      'Channel',
      'Client',
      'Method',
      'Currency',
      'TotalUSD',
      'TotalHTG',
      'Status',
    ].join(',');
    const lines = myOrders.map((o) =>
      [
        o.orderRef,
        new Date(o.createdAt).toISOString(),
        o.orderChannel || 'online',
        `"${(o.customerDisplayName || o.customer?.fullName || '').replace(/"/g, '""')}"`,
        o.paymentMethod,
        o.currency,
        o.totalUsd,
        o.totalHtg,
        o.status,
      ].join(',')
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kalsugift-caisse-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Dedicated Auth / Access Gate
  if (!profile) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <header className="border-b border-[#0066FF]/30 bg-black px-6 h-16 flex items-center justify-between">
          <BrandLogo size="sm" />
          <button
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour Boutique
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-[#D4AF37]/45 bg-[#060912] p-8 text-center space-y-5 shadow-[0_0_50px_rgba(0,102,255,0.16)]">
            <div className="mx-auto w-12 h-12 rounded-xl bg-[#0066FF]/15 border border-[#0066FF]/40 flex items-center justify-center">
              <Lock className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-wider text-[#D4AF37] uppercase">
                Portail Séparé Caissier & Guichet POS
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold text-white">
                Connexion Espace Caissier
              </h1>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Connectez-vous avec votre compte caissier ou administrateur pour accéder au guichet
                d’encaissement Espèces, MonCash et NatCash.
              </p>
            </div>
            <button
              onClick={onRequireAuth}
              className="solid-gold-btn w-full rounded-xl py-3 text-sm font-bold cursor-pointer"
            >
              Se connecter au Guichet
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasCashierAccess) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <header className="border-b border-[#0066FF]/30 bg-black px-6 h-16 flex items-center justify-between">
          <BrandLogo size="sm" />
          <button
            onClick={() => onNavigate('/')}
            className="electric-glow-btn rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer"
          >
            Retour Boutique
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#060912] p-8 text-center space-y-4">
            <Shield className="w-10 h-10 text-red-400 mx-auto" />
            <h1 className="font-display text-xl font-bold text-white">Accès Caissier Refusé</h1>
            <p className="text-xs text-slate-400">
              Le compte <span className="text-white font-semibold">{profile.email}</span> (rôle :{' '}
              <span className="font-mono text-[#D4AF37]">{profile.roleName}</span>) ne dispose pas des
              permissions de guichet caissier.
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => onNavigate('/')}
                className="electric-glow-btn rounded-xl px-5 py-2.5 text-xs font-semibold cursor-pointer"
              >
                Aller à la Boutique
              </button>
              <button
                onClick={onLogout}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Changer de compte
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Standalone Cashier Portal Top Header */}
      <header className="sticky top-0 z-40 border-b border-[#D4AF37]/35 bg-black/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <BrandLogo size="sm" />
            <div className="hidden sm:flex items-center gap-2 text-xs border-l border-white/15 pl-4">
              <span className="font-semibold text-[#D4AF37]">Espace Caissier</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-300 truncate max-w-[200px]">{station}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadCashierData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#0066FF]/40 bg-[#060912] px-3 py-2 text-xs text-slate-200 hover:border-[#0066FF] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#0066FF]' : 'text-[#0066FF]'}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
            <button
              onClick={() => onNavigate('/')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#060912] px-3 py-2 text-xs font-medium text-slate-200 hover:text-white cursor-pointer"
            >
              <Store className="w-3.5 h-3.5 text-[#0066FF]" />
              <span>Boutique</span>
            </button>
            {isAdminUser && (
              <button
                onClick={() => onNavigate('/admin')}
                className="solid-gold-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            )}
            <button
              onClick={onLogout}
              title="Déconnexion"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 hover:text-white cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Shift KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-[#D4AF37]/40 bg-[#060912] p-4">
            <div className="text-xs text-slate-400">Encaissements du jour ({profile.fullName})</div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-[#D4AF37] tabular-nums">
              {shiftSummary.todayTotalHtg.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-400 tabular-nums">
              ${shiftSummary.todayTotalUsd.toFixed(2)} USD · {shiftSummary.todayCount} ventes
            </div>
          </div>

          <div className="rounded-2xl border border-[#0066FF]/35 bg-[#060912] p-4">
            <div className="text-xs text-slate-400">Tiroir Espèces (Cash Aujourd’hui)</div>
            <div className="mt-1.5 font-mono text-xl font-bold text-white tabular-nums">
              {shiftSummary.cashHtg.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG
            </div>
            <div className="mt-0.5 font-mono text-xs text-[#3B9EFF] tabular-nums">
              + ${shiftSummary.cashUsd.toFixed(2)} USD espèces
            </div>
          </div>

          <div className="rounded-2xl border border-[#0066FF]/35 bg-[#060912] p-4">
            <div className="text-xs text-slate-400">MonCash & NatCash Vérifiés</div>
            <div className="mt-1.5 font-mono text-xl font-bold text-white tabular-nums">
              ${(shiftSummary.moncashUsd + shiftSummary.natcashUsd).toFixed(2)} USD
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-400 tabular-nums">
              MonCash ${shiftSummary.moncashUsd.toFixed(2)} · NatCash ${shiftSummary.natcashUsd.toFixed(2)}
            </div>
          </div>

          <div className="rounded-2xl border border-[#D4AF37]/35 bg-[#060912] p-4">
            <div className="text-xs text-slate-400">File d’attente & Taux actif</div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-[#3B9EFF] tabular-nums">
              {pendingQueue.length} <span className="text-sm font-normal text-slate-400">en attente</span>
            </div>
            <div className="mt-0.5 font-mono text-xs text-[#D4AF37] tabular-nums">
              1 USD = {exchangeRate.toFixed(2)} HTG
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTab('pos')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                tab === 'pos'
                  ? 'solid-gold-btn'
                  : 'border border-white/15 bg-[#060912] text-slate-300 hover:text-white'
              }`}
            >
              <Banknote className="w-4 h-4" />
              Guichet POS (Vente Comptoir)
            </button>
            <button
              onClick={() => setTab('queue')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                tab === 'queue'
                  ? 'electric-glow-btn'
                  : 'border border-white/15 bg-[#060912] text-slate-300 hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              File Paiements & Livraisons ({pendingQueue.length})
            </button>
            <button
              onClick={() => setTab('journal')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                tab === 'journal'
                  ? 'electric-glow-btn'
                  : 'border border-white/15 bg-[#060912] text-slate-300 hover:text-white'
              }`}
            >
              <Receipt className="w-4 h-4" />
              Journal de Caisse ({myOrders.length})
            </button>
          </div>
        </div>

        {banner && (
          <div className="rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37]/10 px-4 py-3 text-xs text-[#F2CE5B] flex items-center justify-between">
            <span>{banner}</span>
            <button onClick={() => setBanner('')} className="text-[#F2CE5B] hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {errorMsg && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="text-red-300 hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 1: POS COMPTOIR */}
        {tab === 'pos' && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Left: Catalog Picker */}
            <div className="lg:col-span-7 rounded-2xl border border-[#0066FF]/30 bg-[#060912] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-white">1. Sélection Produit & Forfait</h2>
                <div className="flex items-center gap-1 rounded-lg bg-black p-1 border border-white/10">
                  {(
                    [
                      { id: 'all', label: 'Tous' },
                      { id: 'gift_card', label: 'Cartes Cadeaux' },
                      { id: 'gaming', label: 'Gaming & DLS' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setTypeFilter(f.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                        typeFilter === f.id ? 'bg-[#0066FF] text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-[#0066FF] absolute left-3 top-2.5" />
                <input
                  type="search"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Rechercher DLS, Free Fire, Google Play, Apple..."
                  className="w-full rounded-xl border border-white/15 bg-black pl-9 pr-3 py-2 text-xs text-white focus:border-[#0066FF] focus:outline-none"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                {filteredCatalog.map((prod) => {
                  const selected = activeProduct?.id === prod.id;
                  const firstVar = prod.variants[0];
                  const firstUsd = firstVar ? Number(firstVar.promoPriceUsd || firstVar.sellingPriceUsd) : 0;
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleSelectProduct(prod)}
                      className={`rounded-xl border p-3.5 text-left transition-colors cursor-pointer ${
                        selected
                          ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                          : 'border-white/10 bg-black hover:border-[#0066FF]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#3B9EFF] font-medium">{prod.brand}</span>
                        <span className="text-slate-400">{prod.compatibleRegions}</span>
                      </div>
                      <div className="mt-1 font-semibold text-sm text-white truncate">{prod.name}</div>
                      <div className="mt-1 font-mono text-xs text-[#D4AF37] tabular-nums">
                        Dès {formatMoney(firstUsd, posCurrency, exchangeRate)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeProduct && (
                <div className="pt-3 border-t border-white/10 space-y-2.5">
                  <div className="text-xs font-semibold text-slate-300">
                    Forfaits disponibles — {activeProduct.name}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2.5">
                    {activeProduct.variants.map((v) => {
                      const vUsd = Number(v.promoPriceUsd || v.sellingPriceUsd);
                      const isSel = activeVariant?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVariantId(v.id)}
                          className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                            isSel
                              ? 'border-[#0066FF] bg-[#0066FF]/15'
                              : 'border-white/10 bg-black hover:border-white/30'
                          }`}
                        >
                          <div className="text-xs font-semibold text-white">{v.label}</div>
                          <div className="mt-1 font-mono text-sm font-bold text-[#D4AF37] tabular-nums">
                            {formatMoney(vUsd, posCurrency, exchangeRate)}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                            ${vUsd.toFixed(2)} USD
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Counter Checkout & Receipt */}
            <div className="lg:col-span-5 space-y-4">
              <form
                onSubmit={handleCreatePosSale}
                className="rounded-2xl border border-[#D4AF37]/40 bg-[#060912] p-5 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h2 className="font-display text-lg font-bold text-white">2. Encaissement Guichet</h2>
                  <div className="flex rounded-lg bg-black p-0.5 border border-[#D4AF37]/40">
                    {(['HTG', 'USD'] as CurrencyCode[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPosCurrency(c)}
                        className={`rounded-md px-2.5 py-1 text-xs font-bold cursor-pointer ${
                          posCurrency === c ? 'solid-gold-btn' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Customer Info */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-slate-300 col-span-2">
                    Client inscrit (optionnel)
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => {
                        setSelectedCustomerId(e.target.value);
                        const found = customers.find((c) => String(c.id) === e.target.value);
                        if (found) {
                          setWalkinName(found.fullName);
                          setWalkinPhone(found.phone || '');
                        }
                      }}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-xs text-white"
                    >
                      <option value="">-- Vente comptoir sans compte --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName} ({c.email})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs text-slate-300">
                    Nom du client
                    <input
                      type="text"
                      required
                      value={walkinName}
                      onChange={(e) => setWalkinName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-xs text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    Téléphone / WhatsApp
                    <input
                      type="tel"
                      value={walkinPhone}
                      onChange={(e) => setWalkinPhone(e.target.value)}
                      placeholder="+509 ..."
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 font-mono text-xs text-white"
                    />
                  </label>
                </div>

                {/* Player ID if gaming topup */}
                {activeProduct?.requiresPlayerId && (
                  <div className="rounded-xl border border-[#0066FF]/40 bg-black p-3.5 space-y-2.5">
                    <div className="text-xs font-semibold text-[#3B9EFF]">
                      Player ID requis ({activeProduct.name}) — Aucun mot de passe
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        required
                        placeholder="Player ID"
                        value={playerId}
                        onChange={(e) => setPlayerId(e.target.value)}
                        className="rounded-lg border border-white/15 bg-[#060912] px-3 py-2 font-mono text-xs text-white"
                      />
                      <input
                        type="text"
                        required
                        placeholder="Confirmer Player ID"
                        value={playerIdConfirm}
                        onChange={(e) => setPlayerIdConfirm(e.target.value)}
                        className="rounded-lg border border-white/15 bg-[#060912] px-3 py-2 font-mono text-xs text-white"
                      />
                    </div>
                  </div>
                )}

                {/* Quantity + Payment Method */}
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs text-slate-300">
                    Quantité
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 font-mono text-xs text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-300 col-span-2">
                    Mode d’encaissement
                    <select
                      value={paymentMethod}
                      onChange={(e) =>
                        setPaymentMethod(
                          e.target.value === 'moncash'
                            ? 'moncash'
                            : e.target.value === 'natcash'
                            ? 'natcash'
                            : 'cash'
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-xs text-white"
                    >
                      <option value="cash">Espèces au Guichet (0% frais)</option>
                      <option value="moncash">MonCash ({merchantConfig.moncashNumber})</option>
                      <option value="natcash">NatCash ({merchantConfig.natcashNumber})</option>
                    </select>
                  </label>
                </div>

                {paymentMethod !== 'cash' && (
                  <label className="block text-xs text-slate-300">
                    Référence transaction {paymentMethod.toUpperCase()}
                    <input
                      type="text"
                      required
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      placeholder="Ex: MC-94827105"
                      className="mt-1 w-full rounded-xl border border-[#0066FF]/40 bg-black px-3 py-2 font-mono text-xs text-white"
                    />
                  </label>
                )}

                {/* Optional Immediate Delivery Code */}
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <label className="block text-xs text-slate-300">
                    Code carte ou confirmation recharge (optionnel pour livraison immédiate)
                    <input
                      type="text"
                      value={deliveryCodeOrReceipt}
                      onChange={(e) => setDeliveryCodeOrReceipt(e.target.value)}
                      placeholder="Laisser vide si envoi vers file/fournisseur API"
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 font-mono text-xs text-white"
                    />
                  </label>
                </div>

                {/* Live Summary Box */}
                <div className="rounded-xl border border-[#D4AF37]/35 bg-black p-4 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Article</span>
                    <span className="text-white font-medium">
                      {activeProduct?.name} · {activeVariant?.label} × {quantity}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Frais passerelle</span>
                    <span className="font-mono text-white tabular-nums">
                      {formatMoney(feeUsd, posCurrency, exchangeRate)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-sm">
                    <span className="text-white">Total à encaisser</span>
                    <span className="font-mono text-[#D4AF37] tabular-nums">
                      {posCurrency === 'HTG'
                        ? `${totalHtg.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG ($${totalUsd.toFixed(2)})`
                        : `$${totalUsd.toFixed(2)} USD (${totalHtg.toFixed(0)} HTG)`}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingPos || !activeVariant}
                  className="solid-gold-btn w-full rounded-xl py-3.5 text-sm font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingPos ? 'Traitement en cours...' : 'Valider & Encaisser la Vente'}
                </button>
              </form>

              {lastReceipt && (
                <div className="rounded-2xl border border-[#0066FF]/45 bg-[#060912] p-5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#3B9EFF]">Reçu Guichet Émis</span>
                    <span className="font-mono font-bold text-[#D4AF37]">{lastReceipt.orderRef}</span>
                  </div>
                  <div className="text-slate-300">
                    Client : <span className="text-white font-medium">{lastReceipt.customerDisplayName}</span>
                  </div>
                  <div className="text-slate-300">
                    Produit : {lastReceipt.productName} ({lastReceipt.variantLabel})
                  </div>
                  <div className="font-mono text-slate-300">
                    Payé : {Number(lastReceipt.totalHtg).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG / $
                    {Number(lastReceipt.totalUsd).toFixed(2)} USD ({lastReceipt.paymentMethod.toUpperCase()})
                  </div>
                  <div className="font-mono text-slate-400">Réf : {lastReceipt.transactionRef}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PENDING PAYMENT QUEUE & DELIVERY */}
        {tab === 'queue' && (
          <div className="space-y-4">
            {pendingQueue.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#060912] p-10 text-center text-sm text-slate-400">
                Aucune commande en attente de vérification ou de livraison.
              </div>
            ) : (
              pendingQueue.map((ord) => {
                const pm = ord.payments[0];
                return (
                  <div
                    key={ord.id}
                    className="rounded-2xl border border-[#0066FF]/35 bg-[#060912] p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-[#D4AF37] text-sm">{ord.orderRef}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {new Date(ord.createdAt).toLocaleString('fr-FR')}
                        </span>
                      </div>
                      <span className="text-xs font-semibold uppercase text-[#3B9EFF]">{ord.status}</span>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-slate-400">Client</div>
                        <div className="text-white font-medium">
                          {ord.customerDisplayName || ord.customer?.fullName || 'Client'}
                        </div>
                        <div className="text-slate-400">{ord.customerDisplayPhone || ord.customer?.phone || ord.customer?.email}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Articles</div>
                        {ord.items.map((it) => (
                          <div key={it.id} className="text-white">
                            {it.productName} · {it.variantLabel} × {it.quantity}
                          </div>
                        ))}
                        {ord.playerId && (
                          <div className="font-mono text-[#D4AF37]">Player ID: {ord.playerId}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-slate-400">Montant & Référence</div>
                        <div className="font-mono font-bold text-white tabular-nums">
                          {Number(ord.totalHtg).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG (${ord.totalUsd})
                        </div>
                        {pm && (
                          <div className="font-mono text-[#3B9EFF]">
                            {pm.method.toUpperCase()} · {pm.transactionRef} ({pm.status})
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                      {pm && pm.status === 'verifying' && (
                        <>
                          <button
                            onClick={() => handleVerifyPayment(pm.id, 'approve')}
                            className="electric-glow-btn inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Confirmer Paiement
                          </button>
                          <button
                            onClick={() => handleVerifyPayment(pm.id, 'reject')}
                            className="rounded-lg border border-red-500/40 px-3.5 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 cursor-pointer"
                          >
                            Rejeter
                          </button>
                        </>
                      )}

                      {ord.status !== 'delivered' && (
                        <button
                          onClick={() => setDeliveringOrderId(ord.id)}
                          className="solid-gold-btn inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold cursor-pointer"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Livrer Code / Confirmer Recharge
                        </button>
                      )}
                    </div>

                    {deliveringOrderId === ord.id && (
                      <form
                        onSubmit={handleDeliverOrder}
                        className="rounded-xl border border-[#D4AF37]/40 bg-black p-4 space-y-2.5"
                      >
                        <input
                          type="text"
                          required
                          placeholder="Code carte cadeau ou ID transaction recharge"
                          value={queueDeliveryCode}
                          onChange={(e) => setQueueDeliveryCode(e.target.value)}
                          className="w-full rounded-lg border border-white/15 bg-[#060912] px-3 py-2 font-mono text-xs text-white"
                        />
                        <input
                          type="text"
                          placeholder="Note interne (optionnel)"
                          value={queueDeliveryNotes}
                          onChange={(e) => setQueueDeliveryNotes(e.target.value)}
                          className="w-full rounded-lg border border-white/15 bg-[#060912] px-3 py-2 text-xs text-white"
                        />
                        <div className="flex gap-2">
                          <button type="submit" className="solid-gold-btn rounded-lg px-4 py-2 text-xs font-bold cursor-pointer">
                            Valider Livraison
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeliveringOrderId(null)}
                            className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: CASHIER SHIFT JOURNAL */}
        {tab === 'journal' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D4AF37]/35 bg-[#060912] p-5">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  Journal de Caisse — {profile.fullName}
                </h2>
                <p className="text-xs text-slate-400">
                  Station : {station} · Total traité : {myOrders.length} opérations
                </p>
              </div>
              <button
                onClick={handleExportShiftCsv}
                className="solid-gold-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Exporter Rapport Caisse (CSV)
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#060912] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 text-slate-400">
                  <tr>
                    <th className="p-4">Référence</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Canal</th>
                    <th className="p-4">Client</th>
                    <th className="p-4">Méthode</th>
                    <th className="p-4 text-right">Montant HTG</th>
                    <th className="p-4 text-right">Montant USD</th>
                    <th className="p-4">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {myOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        Aucune opération enregistrée sur votre poste pour l’instant.
                      </td>
                    </tr>
                  ) : (
                    myOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-white/[0.02]">
                        <td className="p-4 font-mono font-bold text-[#D4AF37]">{o.orderRef}</td>
                        <td className="p-4 font-mono text-slate-400">
                          {new Date(o.createdAt).toLocaleString('fr-FR')}
                        </td>
                        <td className="p-4 text-slate-300">
                          {o.orderChannel === 'cashier_pos' ? 'Guichet POS' : 'Validation Web'}
                        </td>
                        <td className="p-4 text-white">
                          {o.customerDisplayName || o.customer?.fullName || 'Client'}
                        </td>
                        <td className="p-4 uppercase font-mono text-[#3B9EFF]">{o.paymentMethod}</td>
                        <td className="p-4 text-right font-mono text-white tabular-nums">
                          {Number(o.totalHtg).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG
                        </td>
                        <td className="p-4 text-right font-mono text-[#D4AF37] tabular-nums">
                          ${Number(o.totalUsd).toFixed(2)}
                        </td>
                        <td className="p-4 uppercase text-slate-300">{o.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
