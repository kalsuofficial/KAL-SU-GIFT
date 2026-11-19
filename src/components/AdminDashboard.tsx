import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  Check,
  Copy,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  MessageSquare,
  Package,
  RefreshCw,
  RotateCcw,
  Server,
  Shield,
  Smartphone,
  Sparkles,
  Store,
  Tag,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo.tsx';
import type {
  Category,
  MerchantConfig,
  OrderRecord,
  PaymentGatewaysConfig,
  Product,
  UserProfile,
} from '../types.ts';

interface AdminDashboardProps {
  profile: UserProfile | null;
  products: Product[];
  categories: Category[];
  exchangeRate: number;
  merchantConfig: MerchantConfig;
  getAuthHeader: () => Promise<string | null>;
  onRefreshStorefront: () => void;
  onNavigate: (path: '/' | '/admin' | '/caissier') => void;
  onRequireAuth: () => void;
  onLogout: () => void;
}

interface AdminKpis {
  totalRevenueUsd: number;
  totalRevenueHtg: number;
  totalSupplierCostUsd: number;
  totalPaymentFeesUsd: number;
  totalEstimatedProfitUsd: number;
  totalRefundsUsd: number;
  customerCount: number;
  todayOrdersCount: number;
  pendingOrdersCount: number;
  deliveredOrdersCount: number;
  paymentsAwaitingVerification: number;
  exchangeRate: number;
}

interface ExchangeRateHistoryRow {
  id: number;
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  createdAt: string;
  updatedByName: string | null;
}

interface SupplierItem {
  id: number;
  name: string;
  code: string;
  priority: string;
  apiUrl: string;
  maskedApiKey: string;
  authType: string;
  supportsDls: boolean;
  isActive: boolean;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
}

interface SupplierProductRow {
  id: number;
  supplierId: number;
  productVariantId: number | null;
  externalSku: string;
  externalName: string;
  regionCode: string;
  supplierPriceUsd: string;
  supplierStock: number;
}

interface RefundRow {
  id: number;
  orderId: number;
  orderRef: string;
  customerName: string;
  customerEmail: string;
  amount: string;
  currency: string;
  reason: string;
  status: string;
  createdAt: string;
}

interface TicketRow {
  id: number;
  ticketRef: string;
  subject: string;
  category: string;
  message: string;
  status: string;
  adminReply: string | null;
  createdAt: string;
}

interface PromotionRow {
  id: number;
  titleFr: string;
  descriptionFr: string;
  discountPercent: string;
  isActive: boolean;
}

interface CouponRow {
  id: number;
  code: string;
  discountType: string;
  discountValue: string;
  minOrderUsd: string;
  usedCount: number;
  maxUses: number;
  isActive: boolean;
}

interface CustomerRow {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  roleId: number;
  roleName: string;
  loyaltyPoints: number;
  cashierStation: string | null;
  isActive: boolean;
  createdAt: string;
}

interface CashierStatRow {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  cashierStation: string | null;
  isActive: boolean;
  totalOrdersCount: number;
  todayOrdersCount: number;
  totalCollectedUsd: number;
  totalCollectedHtg: number;
  todayCollectedHtg: number;
}

interface RoleRow {
  id: number;
  name: string;
}

interface AuditLogRow {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
  createdAt: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  profile,
  products,
  categories,
  exchangeRate,
  merchantConfig,
  getAuthHeader,
  onRefreshStorefront,
  onNavigate,
  onRequireAuth,
  onLogout,
}) => {
  const isAuthorizedAdmin = Boolean(
    profile &&
      (profile.permissions.includes('*') ||
        profile.permissions.includes('orders:read_all') ||
        profile.permissions.includes('products:manage'))
  );

  const [section, setSection] = useState<
    | 'overview'
    | 'rates'
    | 'orders'
    | 'refunds'
    | 'cashiers'
    | 'gateways'
    | 'suppliers'
    | 'catalog'
    | 'promotions'
    | 'finance'
    | 'tickets'
    | 'security'
  >('overview');

  const [kpis, setKpis] = useState<AdminKpis | null>(null);
  const [rateHistory, setRateHistory] = useState<ExchangeRateHistoryRow[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [refundsList, setRefundsList] = useState<RefundRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProductRow[]>([]);
  const [promotionsList, setPromotionsList] = useState<PromotionRow[]>([]);
  const [couponsList, setCouponsList] = useState<CouponRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [cashiersList, setCashiersList] = useState<CashierStatRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [banner, setBanner] = useState('');

  // New cashier creation form
  const [cashierName, setCashierName] = useState('');
  const [cashierEmail, setCashierEmail] = useState('');
  const [cashierPhone, setCashierPhone] = useState('');
  const [cashierStationInput, setCashierStationInput] = useState('Guichet Delmas');
  const [cashierPassword, setCashierPassword] = useState('');

  // Exchange rate & Settings form
  const [rateInput, setRateInput] = useState(String(exchangeRate));
  const [moncashNum, setMoncashNum] = useState(merchantConfig.moncashNumber);
  const [moncashName, setMoncashName] = useState(merchantConfig.moncashName);
  const [moncashFee, setMoncashFee] = useState(String(merchantConfig.moncashFeePercent));
  const [natcashNum, setNatcashNum] = useState(merchantConfig.natcashNumber);
  const [natcashName, setNatcashName] = useState(merchantConfig.natcashName);
  const [natcashFee, setNatcashFee] = useState(String(merchantConfig.natcashFeePercent));
  const [whatsappNum, setWhatsappNum] = useState(merchantConfig.whatsappNumber);
  const [supportEmail, setSupportEmail] = useState(merchantConfig.supportEmail);

  // Dedicated MonCash & NatCash API / Merchant Codes state
  const [gatewaysConfig, setGatewaysConfig] = useState<PaymentGatewaysConfig | null>(null);
  const [mcCode, setMcCode] = useState(merchantConfig.moncashMerchantCode || '');
  const [mcEnv, setMcEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [mcMode, setMcMode] = useState<'manual' | 'auto_api'>('manual');
  const [mcApiUrl, setMcApiUrl] = useState('https://sandbox.moncashbutton.digicelgroup.com/Api');
  const [mcClientId, setMcClientId] = useState('');
  const [mcClientSecret, setMcClientSecret] = useState('');
  const [mcWebhookSecret, setMcWebhookSecret] = useState('');
  const [showMcSecrets, setShowMcSecrets] = useState(false);

  const [ncCode, setNcCode] = useState(merchantConfig.natcashMerchantCode || '');
  const [ncMerchantId, setNcMerchantId] = useState('');
  const [ncEnv, setNcEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [ncMode, setNcMode] = useState<'manual' | 'auto_api'>('manual');
  const [ncApiUrl, setNcApiUrl] = useState('');
  const [ncApiKey, setNcApiKey] = useState('');
  const [ncApiSecret, setNcApiSecret] = useState('');
  const [ncWebhookSecret, setNcWebhookSecret] = useState('');
  const [showNcSecrets, setShowNcSecrets] = useState(false);
  const [savingGateway, setSavingGateway] = useState<'moncash' | 'natcash' | null>(null);
  const [testingGateway, setTestingGateway] = useState<'moncash' | 'natcash' | null>(null);

  // Delivery modal input per order
  const [deliveringOrderId, setDeliveringOrderId] = useState<number | null>(null);
  const [deliveryCode, setDeliveryCode] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // New supplier form
  const [supName, setSupName] = useState('');
  const [supCode, setSupCode] = useState('');
  const [supPriority, setSupPriority] = useState<'primary' | 'secondary'>('primary');
  const [supUrl, setSupUrl] = useState('');
  const [supKey, setSupKey] = useState('');
  const [supAuth, setSupAuth] = useState('bearer');
  const [supDls, setSupDls] = useState(false);

  // New category & product form
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'gift_card' | 'gaming_topup'>('gift_card');
  const [newProdName, setNewProdName] = useState('');
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdCatId, setNewProdCatId] = useState<number>(categories[0]?.id ?? 1);
  const [newProdRegion, setNewProdRegion] = useState('USA (USD)');
  const [newProdPrice, setNewProdPrice] = useState('10.80');
  const [newProdCost, setNewProdCost] = useState('9.40');
  const [newProdMargin, setNewProdMargin] = useState('12.00');

  // New promotion & coupon form
  const [promoTitle, setPromoTitle] = useState('');
  const [promoDiscount, setPromoDiscount] = useState('10');
  const [couponCode, setCouponCode] = useState('');
  const [couponVal, setCouponVal] = useState('10');
  const [couponType, setCouponType] = useState<'percent' | 'fixed_usd'>('percent');

  // Ticket reply state
  const [replyTicketId, setReplyTicketId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState('resolved');

  useEffect(() => {
    setRateInput(String(exchangeRate));
  }, [exchangeRate]);

  const loadAllAdmin = async () => {
    if (!isAuthorizedAdmin) return;
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    try {
      const [ovRes, ratesRes, ordRes, refRes, supRes, promoRes, tktRes, custRes, cashRes, logRes, gwRes] =
        await Promise.all([
          fetch('/api/admin/overview', { headers: { Authorization: authHeader } }),
          fetch('/api/admin/exchange-rates', { headers: { Authorization: authHeader } }),
          fetch('/api/admin/orders', { headers: { Authorization: authHeader } }),
          fetch('/api/admin/refunds', { headers: { Authorization: authHeader } }),
          fetch('/api/admin/suppliers', { headers: { Authorization: authHeader } }),
          fetch('/api/admin/promotions', { headers: { Authorization: authHeader } }),
          fetch('/api/tickets', { headers: { Authorization: authHeader } }),
          fetch('/api/admin/customers', { headers: { Authorization: authHeader } }),
          fetch('/api/admin/cashiers', { headers: { Authorization: authHeader } }),
          fetch('/api/admin/audit-logs', { headers: { Authorization: authHeader } }),
          fetch('/api/admin/payment-gateways', { headers: { Authorization: authHeader } }),
        ]);
      if (ovRes.ok) setKpis((await ovRes.json()).kpis);
      if (ratesRes.ok) setRateHistory((await ratesRes.json()).rates || []);
      if (ordRes.ok) setOrders((await ordRes.json()).orders || []);
      if (refRes.ok) setRefundsList((await refRes.json()).refunds || []);
      if (supRes.ok) {
        const sJson = await supRes.json();
        setSuppliers(sJson.suppliers || []);
        setSupplierProducts(sJson.supplierProducts || []);
      }
      if (promoRes.ok) {
        const pJson = await promoRes.json();
        setPromotionsList(pJson.promotions || []);
        setCouponsList(pJson.coupons || []);
      }
      if (tktRes.ok) setTickets((await tktRes.json()).tickets || []);
      if (custRes.ok) {
        const cJson = await custRes.json();
        setCustomers(cJson.customers || []);
        setRoles(cJson.roles || []);
      }
      if (cashRes.ok) setCashiersList((await cashRes.json()).cashiers || []);
      if (logRes.ok) setAuditLogs((await logRes.json()).logs || []);
      if (gwRes.ok) {
        const gwJson = (await gwRes.json()) as PaymentGatewaysConfig;
        setGatewaysConfig(gwJson);
        setMoncashNum(gwJson.moncash.merchantNumber);
        setMcCode(gwJson.moncash.merchantCode);
        setMoncashName(gwJson.moncash.merchantName);
        setMoncashFee(String(gwJson.moncash.feePercent));
        setMcEnv(gwJson.moncash.env);
        setMcMode(gwJson.moncash.verificationMode);
        setMcApiUrl(gwJson.moncash.apiUrl);

        setNatcashNum(gwJson.natcash.merchantNumber);
        setNcCode(gwJson.natcash.merchantCode);
        setNcMerchantId(gwJson.natcash.merchantId);
        setNatcashName(gwJson.natcash.merchantName);
        setNatcashFee(String(gwJson.natcash.feePercent));
        setNcEnv(gwJson.natcash.env);
        setNcMode(gwJson.natcash.verificationMode);
        setNcApiUrl(gwJson.natcash.apiUrl);
      }
    } catch (err) {
      console.error('Admin load error:', err);
    }
  };

  useEffect(() => {
    loadAllAdmin();
  }, [isAuthorizedAdmin]);

  const handleVerifyPayment = async (paymentId: number, action: 'approve' | 'reject') => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const reason = action === 'reject' ? 'Référence introuvable sur relevé marchand' : '';
    const resp = await fetch(`/api/admin/payments/${paymentId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ action, reason }),
    });
    const data = await resp.json();
    setBanner(data.dispatchResult?.message || (action === 'approve' ? 'Paiement validé.' : 'Paiement refusé.'));
    loadAllAdmin();
  };

  const handleManualDeliver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveringOrderId) return;
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch(`/api/admin/orders/${deliveringOrderId}/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ codeOrReceipt: deliveryCode, notes: deliveryNotes }),
    });
    if (resp.ok) {
      setDeliveringOrderId(null);
      setDeliveryCode('');
      setDeliveryNotes('');
      setBanner('Commande marquée comme livrée et client notifié.');
      loadAllAdmin();
    }
  };

  const handleProcessRefund = async (refundId: number, status: 'processed' | 'rejected') => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch(`/api/admin/refunds/${refundId}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ status }),
    });
    if (resp.ok) {
      setBanner(`Remboursement #${refundId} mis à jour (${status}).`);
      loadAllAdmin();
    }
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/admin/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        name: supName,
        code: supCode,
        priority: supPriority,
        apiUrl: supUrl,
        apiKey: supKey,
        authType: supAuth,
        supportsDls: supDls,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setBanner(data.error || 'Erreur ajout fournisseur');
      return;
    }
    setSupName('');
    setSupCode('');
    setSupUrl('');
    setSupKey('');
    setBanner('Fournisseur API enregistré (clé chiffrée AES-256 côté serveur).');
    loadAllAdmin();
  };

  const handleToggleSupplier = async (s: SupplierItem) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    await fetch(`/api/admin/suppliers/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    loadAllAdmin();
  };

  const handleTestSupplier = async (id: number) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch(`/api/admin/suppliers/${id}/test`, {
      method: 'POST',
      headers: { Authorization: authHeader },
    });
    const data = await resp.json();
    setBanner(`Test API : ${data.message}`);
    loadAllAdmin();
  };

  const handleSyncSupplier = async (id: number) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch(`/api/admin/suppliers/${id}/sync`, {
      method: 'POST',
      headers: { Authorization: authHeader },
    });
    const data = await resp.json();
    setBanner(data.message || 'Synchronisation terminée');
    loadAllAdmin();
    onRefreshStorefront();
  };

  const handleMapSupplierProduct = async (spId: number, productVariantId: number | null) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    await fetch(`/api/admin/supplier-products/${spId}/map`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ productVariantId }),
    });
    setBanner('Correspondance produit mise à jour.');
    loadAllAdmin();
  };

  const handleUpdateRate = async (newRateValue: number) => {
    if (!Number.isFinite(newRateValue) || newRateValue <= 0) return;
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/admin/exchange-rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ rate: newRateValue }),
    });
    if (resp.ok) {
      setRateInput(String(newRateValue));
      setBanner(`Taux de change mis à jour : 1 USD = ${newRateValue.toFixed(2)} HTG`);
      onRefreshStorefront();
      loadAllAdmin();
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        moncash_merchant_number: moncashNum,
        moncash_merchant_name: moncashName,
        moncash_fee_percent: moncashFee,
        natcash_merchant_number: natcashNum,
        natcash_merchant_name: natcashName,
        natcash_fee_percent: natcashFee,
        whatsapp_support_number: whatsappNum,
        support_email: supportEmail,
      }),
    });
    if (resp.ok) {
      setBanner('Paramètres marchands et support mis à jour.');
      onRefreshStorefront();
    }
  };

  const handleSaveGateway = async (gateway: 'moncash' | 'natcash', e: React.FormEvent) => {
    e.preventDefault();
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    setSavingGateway(gateway);
    try {
      const payload =
        gateway === 'moncash'
          ? {
              moncash: {
                merchantNumber: moncashNum,
                merchantCode: mcCode,
                merchantName: moncashName,
                feePercent: moncashFee,
                env: mcEnv,
                verificationMode: mcMode,
                apiUrl: mcApiUrl,
                clientId: mcClientId,
                clientSecret: mcClientSecret,
                webhookSecret: mcWebhookSecret,
              },
            }
          : {
              natcash: {
                merchantNumber: natcashNum,
                merchantCode: ncCode,
                merchantId: ncMerchantId,
                merchantName: natcashName,
                feePercent: natcashFee,
                env: ncEnv,
                verificationMode: ncMode,
                apiUrl: ncApiUrl,
                apiKey: ncApiKey,
                apiSecret: ncApiSecret,
                webhookSecret: ncWebhookSecret,
              },
            };

      const resp = await fetch('/api/admin/payment-gateways', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setBanner(data.error || `Erreur sauvegarde ${gateway.toUpperCase()}`);
        return;
      }
      if (gateway === 'moncash') {
        setMcClientId('');
        setMcClientSecret('');
        setMcWebhookSecret('');
      } else {
        setNcApiKey('');
        setNcApiSecret('');
        setNcWebhookSecret('');
      }
      setBanner(
        `Configuration ${gateway === 'moncash' ? 'MonCash' : 'NatCash'} enregistrée et chiffrée côté serveur.`
      );
      await loadAllAdmin();
      onRefreshStorefront();
    } finally {
      setSavingGateway(null);
    }
  };

  const handleClearGatewaySecrets = async (gateway: 'moncash' | 'natcash') => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/admin/payment-gateways', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(
        gateway === 'moncash' ? { moncash: { clearSecrets: true } } : { natcash: { clearSecrets: true } }
      ),
    });
    if (resp.ok) {
      setBanner(`Clés API ${gateway === 'moncash' ? 'MonCash' : 'NatCash'} supprimées. Validation manuelle active.`);
      await loadAllAdmin();
      onRefreshStorefront();
    }
  };

  const handleTestGateway = async (gateway: 'moncash' | 'natcash') => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    setTestingGateway(gateway);
    try {
      const resp = await fetch(`/api/admin/payment-gateways/${gateway}/test`, {
        method: 'POST',
        headers: { Authorization: authHeader },
      });
      const data = await resp.json();
      setBanner(`${gateway === 'moncash' ? 'MonCash' : 'NatCash'} : ${data.message}`);
      await loadAllAdmin();
    } finally {
      setTestingGateway(null);
    }
  };

  const handleCopyWebhook = async () => {
    const endpoint = gatewaysConfig?.webhookEndpoint || `${window.location.origin}/api/webhooks/payment`;
    try {
      await navigator.clipboard.writeText(endpoint);
      setBanner(`URL Webhook copiée : ${endpoint}`);
    } catch {
      setBanner(`URL Webhook : ${endpoint}`);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ nameFr: newCatName, type: newCatType }),
    });
    if (resp.ok) {
      setNewCatName('');
      setBanner('Catégorie créée.');
      onRefreshStorefront();
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        categoryId: newProdCatId,
        brand: newProdBrand,
        name: newProdName,
        compatibleRegions: newProdRegion,
        sellingPriceUsd: newProdPrice,
        supplierCostUsd: newProdCost,
        marginPercent: newProdMargin,
      }),
    });
    if (resp.ok) {
      setNewProdName('');
      setNewProdBrand('');
      setBanner('Produit ajouté au catalogue.');
      onRefreshStorefront();
    }
  };

  const handleToggleProductFlag = async (
    productId: number,
    field: 'isActive' | 'isPopular' | 'isNew' | 'isPromo',
    value: boolean
  ) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    await fetch(`/api/admin/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ [field]: value }),
    });
    onRefreshStorefront();
  };

  const handleUpdateVariantField = async (
    variantId: number,
    payload: Record<string, string>
  ) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    await fetch(`/api/admin/variants/${variantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(payload),
    });
    setBanner('Tarif / stock mis à jour.');
    onRefreshStorefront();
  };

  const handleCreatePromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/admin/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ titleFr: promoTitle, discountPercent: Number(promoDiscount) }),
    });
    if (resp.ok) {
      setPromoTitle('');
      setBanner('Promotion créée.');
      loadAllAdmin();
      onRefreshStorefront();
    }
  };

  const handleTogglePromo = async (id: number, isActive: boolean) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    await fetch(`/api/admin/promotions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ isActive }),
    });
    loadAllAdmin();
    onRefreshStorefront();
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        code: couponCode,
        discountType: couponType,
        discountValue: Number(couponVal),
      }),
    });
    if (resp.ok) {
      setCouponCode('');
      setBanner('Code promo créé.');
      loadAllAdmin();
    }
  };

  const handleToggleCoupon = async (id: number, isActive: boolean) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    await fetch(`/api/admin/coupons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ isActive }),
    });
    loadAllAdmin();
  };

  const handleReplyTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyTicketId) return;
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch(`/api/admin/tickets/${replyTicketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ status: replyStatus, adminReply: replyText }),
    });
    if (resp.ok) {
      setReplyTicketId(null);
      setReplyText('');
      setBanner('Réponse envoyée et client notifié.');
      loadAllAdmin();
    }
  };

  const handleRoleChange = async (userId: number, roleId: number) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    await fetch(`/api/admin/customers/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ roleId }),
    });
    setBanner('Rôle RBAC mis à jour.');
    loadAllAdmin();
  };

  const handleCreateCashier = async (e: React.FormEvent) => {
    e.preventDefault();
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/admin/cashiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        fullName: cashierName,
        email: cashierEmail,
        phone: cashierPhone,
        cashierStation: cashierStationInput,
        password: cashierPassword,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setBanner(data.error || 'Erreur création caissier');
      return;
    }
    setCashierName('');
    setCashierEmail('');
    setCashierPhone('');
    setCashierPassword('');
    setBanner('Compte Caissier créé et activé pour le guichet POS.');
    loadAllAdmin();
  };

  const handleToggleUserStatus = async (userId: number, isActive: boolean, station?: string) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    await fetch(`/api/admin/customers/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ isActive, ...(station !== undefined ? { cashierStation: station } : {}) }),
    });
    setBanner('Statut / station utilisateur mis à jour.');
    loadAllAdmin();
  };

  const handleExportFinanceCsv = () => {
    const headers = [
      'OrderRef',
      'Date',
      'Status',
      'Currency',
      'ExchangeRate',
      'Method',
      'TotalUSD',
      'TotalHTG',
      'SupplierCostUSD',
      'PaymentFeeUSD',
      'EstimatedProfitUSD',
    ];
    const rows = orders.map((o) =>
      [
        o.orderRef,
        new Date(o.createdAt).toISOString(),
        o.status,
        o.currency,
        o.exchangeRateUsed,
        o.paymentMethod,
        o.totalUsd,
        o.totalHtg,
        o.supplierCostUsd,
        o.paymentFeeUsd,
        o.estimatedProfitUsd,
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kal-su-gift-finances-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredOrders = orders.filter((o) =>
    orderStatusFilter === 'all' ? true : o.status === orderStatusFilter
  );

  const allVariants = products.flatMap((p) =>
    p.variants.map((v) => ({ ...v, productName: p.name }))
  );

  const moncashOrdersCount = orders.filter((o) => o.paymentMethod === 'moncash').length;
  const natcashOrdersCount = orders.filter((o) => o.paymentMethod === 'natcash').length;

  const navItems = [
    { id: 'overview' as const, label: 'Vue & KPIs', icon: BarChart3 },
    { id: 'rates' as const, label: 'Taux de Change', icon: ArrowRightLeft },
    { id: 'orders' as const, label: 'Commandes & Paiements', icon: Package },
    { id: 'refunds' as const, label: 'Remboursements', icon: RotateCcw },
    { id: 'cashiers' as const, label: 'Caissiers & POS', icon: Banknote },
    { id: 'gateways' as const, label: 'MonCash & NatCash', icon: Smartphone },
    { id: 'suppliers' as const, label: 'Fournisseurs API', icon: Server },
    { id: 'catalog' as const, label: 'Catalogue & Marges', icon: Tag },
    { id: 'promotions' as const, label: 'Promos & Coupons', icon: Sparkles },
    { id: 'finance' as const, label: 'Finances & Passerelles', icon: DollarSign },
    { id: 'tickets' as const, label: 'Tickets Support', icon: MessageSquare },
    { id: 'security' as const, label: 'Clients, Rôles & Audit', icon: Shield },
  ];

  // Standalone Auth Gate for /admin
  if (!profile) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <header className="border-b border-[#0066FF]/35 bg-black px-6 h-16 flex items-center justify-between">
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
          <div className="w-full max-w-md rounded-2xl border border-[#D4AF37]/50 bg-[#060912] p-8 text-center space-y-5 shadow-[0_0_55px_rgba(0,102,255,0.18)]">
            <div className="mx-auto w-12 h-12 rounded-xl bg-[#0066FF]/15 border border-[#0066FF]/50 flex items-center justify-center">
              <Lock className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-wider text-[#D4AF37] uppercase">
                Console Administration Séparée
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold text-white">
                Accès Administrateur KAL-SU
              </h1>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Authentifiez-vous avec votre compte administrateur pour gérer les taux USD/HTG,
                caissiers, fournisseurs API et finances.
              </p>
            </div>
            <button
              onClick={onRequireAuth}
              className="solid-gold-btn w-full rounded-xl py-3 text-sm font-bold cursor-pointer"
            >
              Connexion Administrateur
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <header className="border-b border-[#0066FF]/35 bg-black px-6 h-16 flex items-center justify-between">
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
            <h1 className="font-display text-xl font-bold text-white">Accès Administrateur Refusé</h1>
            <p className="text-xs text-slate-400">
              Votre compte <span className="text-white font-semibold">{profile.email}</span> (rôle :{' '}
              <span className="font-mono text-[#D4AF37]">{profile.roleName}</span>) n’est pas autorisé à accéder à l’administration.
            </p>
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              <button
                onClick={() => onNavigate('/')}
                className="electric-glow-btn rounded-xl px-5 py-2.5 text-xs font-semibold cursor-pointer"
              >
                Boutique
              </button>
              {profile.permissions.includes('cashier:pos') && (
                <button
                  onClick={() => onNavigate('/caissier')}
                  className="solid-gold-btn rounded-xl px-5 py-2.5 text-xs font-bold cursor-pointer"
                >
                  Aller au Guichet Caissier
                </button>
              )}
              <button
                onClick={onLogout}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeNavLabel = navItems.find((i) => i.id === section)?.label || 'Administration';

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Standalone Admin Workspace Top Header */}
      <header className="sticky top-0 z-40 border-b border-[#D4AF37]/35 bg-black/95 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <BrandLogo size="sm" />
            <div className="hidden md:flex items-center gap-2 text-xs border-l border-white/15 pl-4">
              <span className="font-semibold text-[#D4AF37]">Administration</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-200 truncate">{activeNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden lg:inline font-mono text-xs text-[#D4AF37] mr-2">
              1 USD = {exchangeRate.toFixed(2)} HTG
            </span>
            <button
              onClick={loadAllAdmin}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#0066FF]/45 bg-[#060912] px-3 py-2 text-xs font-semibold text-white hover:border-[#0066FF] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#0066FF]" />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
            <button
              onClick={() => onNavigate('/caissier')}
              className="electric-glow-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>Caissier POS</span>
            </button>
            <button
              onClick={() => onNavigate('/')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#060912] px-3 py-2 text-xs font-medium text-slate-200 hover:text-white cursor-pointer"
            >
              <Store className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="hidden sm:inline">Boutique</span>
            </button>
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

      <div className="mx-auto w-full max-w-[1440px] flex-1 flex flex-col lg:flex-row">
        {/* Dedicated Left Sidebar Navigation (Desktop) & Horizontal Strip (Mobile) */}
        <aside className="lg:w-64 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-[#0066FF]/25 bg-[#04060D] p-3 lg:p-4">
          <div className="hidden lg:block mb-4 px-3 pb-3 border-b border-white/10">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">
              {profile.roleName}
            </div>
            <div className="text-xs font-semibold text-white truncate mt-0.5">{profile.fullName}</div>
            <div className="text-[11px] text-slate-400 truncate">{profile.email}</div>
          </div>

          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={`inline-flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer text-left ${
                    active
                      ? 'solid-gold-btn'
                      : 'text-slate-300 hover:bg-[#0066FF]/15 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Admin Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 min-w-0">
          {banner && (
            <div className="rounded-xl border border-[#D4AF37]/55 bg-[#D4AF37]/10 px-4 py-3 text-xs text-[#F2CE5B] flex items-center justify-between">
              <span>{banner}</span>
              <button onClick={() => setBanner('')} className="text-slate-300 hover:text-white cursor-pointer">
                OK
              </button>
            </div>
          )}

      {/* 1. OVERVIEW */}
      {section === 'overview' && kpis && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-[#0066FF]/25 bg-[#060912] p-5">
              <div className="text-xs text-slate-400">Ventes totales (USD / HTG)</div>
              <div className="mt-2 font-mono text-xl font-bold text-white">${kpis.totalRevenueUsd.toFixed(2)}</div>
              <div className="mt-0.5 font-mono text-xs text-[#D4AF37]">{kpis.totalRevenueHtg.toLocaleString('fr-FR')} HTG</div>
            </div>
            <div className="rounded-2xl border border-[#0066FF]/25 bg-[#060912] p-5">
              <div className="text-xs text-slate-400">Bénéfice net estimé</div>
              <div className="mt-2 font-mono text-xl font-bold text-emerald-400">${kpis.totalEstimatedProfitUsd.toFixed(2)}</div>
              <div className="mt-0.5 font-mono text-xs text-slate-400">Coût fourn.: ${kpis.totalSupplierCostUsd.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#060912] p-5">
              <div className="text-xs text-slate-400">Paiements à vérifier</div>
              <div className="mt-2 font-mono text-xl font-bold text-[#D4AF37]">{kpis.paymentsAwaitingVerification}</div>
              <div className="mt-0.5 text-xs text-slate-400">En attente: {kpis.pendingOrdersCount} cmd</div>
            </div>
            <div className="rounded-2xl border border-[#0066FF]/25 bg-[#060912] p-5">
              <div className="text-xs text-slate-400">Clients & Commandes</div>
              <div className="mt-2 font-mono text-xl font-bold text-white">{kpis.customerCount} clients</div>
              <div className="mt-0.5 font-mono text-xs text-slate-400">Aujourd’hui: {kpis.todayOrdersCount} · Livrées: {kpis.deliveredOrdersCount}</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#0066FF]/20 bg-[#060912] p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-white text-sm">Passerelles MonCash & NatCash</div>
                <button
                  onClick={() => setSection('gateways')}
                  className="rounded-lg border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-2.5 py-1 text-[11px] font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/20 cursor-pointer"
                >
                  Configurer APIs & Codes
                </button>
              </div>
              <p className="text-slate-300">
                • MonCash :{' '}
                {gatewaysConfig?.moncash.autoApiActive
                  ? `API ${gatewaysConfig.moncash.env} active`
                  : gatewaysConfig?.moncash.autoApiConfigured
                  ? 'Clés enregistrées (mode manuel actif)'
                  : 'Validation manuelle par référence (à configurer plus tard)'}
              </p>
              <p className="text-slate-300">
                • NatCash :{' '}
                {gatewaysConfig?.natcash.autoApiActive
                  ? `API ${gatewaysConfig.natcash.env} active`
                  : gatewaysConfig?.natcash.autoApiConfigured
                  ? 'Clés enregistrées (mode manuel actif)'
                  : 'Validation manuelle par référence (à configurer plus tard)'}
              </p>
            </div>

            <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#060912] p-5 space-y-2.5 text-xs">
              <div className="font-semibold text-white text-sm">Performance des fournisseurs</div>
              {suppliers.length === 0 ? (
                <p className="text-slate-400">Aucun fournisseur connecté — livraison manuelle active.</p>
              ) : (
                suppliers.map((s) => (
                  <div key={s.id} className="flex justify-between text-slate-300">
                    <span>{s.name} ({s.priority})</span>
                    <span className={s.lastTestStatus === 'success' ? 'text-emerald-400' : 'text-amber-400'}>
                      {s.lastTestStatus || 'Non testé'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. DEDICATED EXCHANGE RATE SECTION */}
      {section === 'rates' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 rounded-2xl border border-[#D4AF37]/30 bg-[#060912] p-6 space-y-5">
              <div>
                <div className="text-xs text-[#D4AF37] font-medium">Taux de change actif</div>
                <div className="mt-1 font-mono text-3xl font-bold text-white">
                  1 USD = <span className="gold-shimmer-text">{exchangeRate.toFixed(2)} HTG</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Tous les prix HTG du catalogue et les nouvelles commandes utilisent ce taux immédiatement.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleUpdateRate(Number(rateInput));
                }}
                className="space-y-3"
              >
                <label className="block text-xs font-medium text-slate-300">
                  Nouveau taux USD → HTG
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#0066FF]/30 bg-[#000000] px-3.5 py-2.5 font-mono text-base text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {[-2, -0.5, 0.5, 1, 2.5].map((delta) => (
                    <button
                      type="button"
                      key={delta}
                      onClick={() => {
                        const next = Math.max(1, Number((Number(rateInput || exchangeRate) + delta).toFixed(2)));
                        setRateInput(String(next));
                      }}
                      className="rounded-lg border border-white/10 bg-[#000000] px-2.5 py-1.5 font-mono text-xs text-slate-300 hover:border-[#D4AF37]/50 hover:text-white cursor-pointer"
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  className="gold-shimmer-btn w-full rounded-xl py-3 text-sm font-bold cursor-pointer"
                >
                  Appliquer le nouveau taux
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 rounded-2xl border border-[#0066FF]/25 bg-[#060912] p-6 space-y-4">
              <h3 className="font-display text-lg font-semibold text-white">
                Aperçu de conversion avec le taux saisi ({Number(rateInput || exchangeRate).toFixed(2)} HTG)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[5, 10, 25, 50, 100].map((usd) => {
                  const previewRate = Number(rateInput) || exchangeRate;
                  return (
                    <div key={usd} className="rounded-xl border border-white/10 bg-[#000000] p-3.5">
                      <div className="font-mono text-xs text-slate-400">${usd.toFixed(2)} USD</div>
                      <div className="mt-1 font-mono text-sm font-bold text-[#D4AF37]">
                        {(usd * previewRate).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-white/10 pt-4">
                <h4 className="text-xs font-semibold text-slate-300 mb-3">Historique des taux enregistrés</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/10 text-slate-400">
                      <tr>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Paire</th>
                        <th className="py-2 pr-3 text-right">Taux</th>
                        <th className="py-2">Modifié par</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {rateHistory.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2.5 pr-3 font-mono text-slate-400">
                            {new Date(r.createdAt).toLocaleString('fr-FR')}
                          </td>
                          <td className="py-2.5 pr-3 text-white">{r.baseCurrency}/{r.targetCurrency}</td>
                          <td className="py-2.5 pr-3 text-right font-mono font-semibold text-[#D4AF37]">
                            {Number(r.rate).toFixed(2)} HTG
                          </td>
                          <td className="py-2.5 text-slate-300">{r.updatedByName || 'Système'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. ORDERS & PAYMENTS */}
      {section === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'Toutes' },
              { id: 'payment_verifying', label: 'À vérifier' },
              { id: 'processing', label: 'À livrer' },
              { id: 'delivered', label: 'Livrées' },
              { id: 'failed', label: 'Échecs' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setOrderStatusFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${
                  orderStatusFilter === f.id
                    ? 'bg-[#0066FF] text-white'
                    : 'border border-white/10 bg-[#060912] text-slate-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#060912] p-8 text-center text-sm text-slate-400">
              Aucune commande dans ce filtre.
            </div>
          ) : (
            filteredOrders.map((ord) => (
              <div key={ord.id} className="rounded-2xl border border-[#0066FF]/20 bg-[#060912] p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono font-bold text-white">{ord.orderRef}</span>
                      <span>·</span>
                      <span>{ord.customer?.fullName} ({ord.customer?.email})</span>
                      <span>·</span>
                      <span className="uppercase text-[#D4AF37]">{ord.paymentMethod}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {ord.items.map((i) => `${i.productName} (${i.variantLabel}) × ${i.quantity}`).join(', ')}
                      {ord.playerId && <span className="ml-2 font-mono text-[#60A5FA]">[ID: {ord.playerId}]</span>}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <div className="text-sm font-bold text-[#D4AF37]">
                      ${Number(ord.totalUsd).toFixed(2)} / {Number(ord.totalHtg).toFixed(0)} HTG
                    </div>
                    <div className="text-[#60A5FA]">{ord.status}</div>
                  </div>
                </div>

                {ord.payments.map((pm) => (
                  <div key={pm.id} className="rounded-xl border border-white/10 bg-[#000000] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-slate-400">Réf TX : </span>
                      <span className="font-mono font-semibold text-white">{pm.transactionRef}</span>
                      <span className="ml-2 text-slate-400">({pm.status} · {pm.verificationMode})</span>
                    </div>
                    {pm.status === 'verifying' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleVerifyPayment(pm.id, 'approve')}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" /> Approuver
                        </button>
                        <button
                          onClick={() => handleVerifyPayment(pm.id, 'reject')}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-500 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Refuser
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {(ord.status === 'paid' || ord.status === 'processing') && (
                  <div>
                    {deliveringOrderId === ord.id ? (
                      <form onSubmit={handleManualDeliver} className="rounded-xl border border-[#0066FF]/30 bg-[#000000] p-3 flex flex-wrap gap-2">
                        <input
                          type="text"
                          required
                          value={deliveryCode}
                          onChange={(e) => setDeliveryCode(e.target.value)}
                          placeholder="Code carte cadeau ou ID reçu recharge DLS"
                          className="flex-1 min-w-[220px] rounded-lg border border-white/10 bg-[#060912] px-3 py-2 text-xs font-mono text-white"
                        />
                        <input
                          type="text"
                          value={deliveryNotes}
                          onChange={(e) => setDeliveryNotes(e.target.value)}
                          placeholder="Notes client (optionnel)"
                          className="flex-1 min-w-[180px] rounded-lg border border-white/10 bg-[#060912] px-3 py-2 text-xs text-white"
                        />
                        <button type="submit" className="electric-glow-btn rounded-lg px-4 py-2 text-xs font-semibold text-white cursor-pointer">
                          Livrer & Notifier
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => setDeliveringOrderId(ord.id)}
                        className="electric-glow-btn rounded-lg px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
                      >
                        Effectuer livraison manuelle
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. REFUNDS */}
      {section === 'refunds' && (
        <div className="rounded-2xl border border-[#0066FF]/20 bg-[#060912] overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 text-slate-400">
              <tr>
                <th className="p-4">Commande</th>
                <th className="p-4">Client</th>
                <th className="p-4">Motif</th>
                <th className="p-4 text-right">Montant</th>
                <th className="p-4">Statut</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {refundsList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Aucune demande de remboursement.
                  </td>
                </tr>
              ) : (
                refundsList.map((rf) => (
                  <tr key={rf.id}>
                    <td className="p-4 font-mono text-white">{rf.orderRef}</td>
                    <td className="p-4 text-slate-300">{rf.customerName} ({rf.customerEmail})</td>
                    <td className="p-4 text-slate-300">{rf.reason}</td>
                    <td className="p-4 text-right font-mono text-[#D4AF37]">{rf.amount} {rf.currency}</td>
                    <td className="p-4 text-white">{rf.status}</td>
                    <td className="p-4 text-right">
                      {rf.status === 'requested' && (
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => handleProcessRefund(rf.id, 'processed')}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-white font-semibold cursor-pointer"
                          >
                            Rembourser
                          </button>
                          <button
                            onClick={() => handleProcessRefund(rf.id, 'rejected')}
                            className="rounded-lg bg-red-600 px-2.5 py-1 text-white font-semibold cursor-pointer"
                          >
                            Refuser
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 4B. DEDICATED CASHIERS & POS TEAM MANAGEMENT */}
      {section === 'cashiers' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleCreateCashier}
              className="lg:col-span-5 rounded-2xl border border-[#D4AF37]/45 bg-[#060912] p-6 space-y-3.5"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-display text-lg font-bold text-white">Créer un compte Caissier</h3>
              </div>
              <p className="text-xs text-slate-400">
                Le caissier pourra se connecter sur <span className="font-mono text-[#3B9EFF]">/caissier</span> pour
                effectuer des ventes comptoir et valider MonCash/NatCash.
              </p>
              <input
                type="text"
                required
                placeholder="Nom complet du caissier"
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black px-3.5 py-2.5 text-sm text-white"
              />
              <input
                type="email"
                required
                placeholder="Email de connexion caissier"
                value={cashierEmail}
                onChange={(e) => setCashierEmail(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black px-3.5 py-2.5 text-sm text-white"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="tel"
                  placeholder="Téléphone (+509 ...)"
                  value={cashierPhone}
                  onChange={(e) => setCashierPhone(e.target.value)}
                  className="rounded-xl border border-white/15 bg-black px-3.5 py-2.5 font-mono text-xs text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Guichet / Station"
                  value={cashierStationInput}
                  onChange={(e) => setCashierStationInput(e.target.value)}
                  className="rounded-xl border border-white/15 bg-black px-3.5 py-2.5 text-xs text-white"
                />
              </div>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Mot de passe initial (min 8 car.)"
                value={cashierPassword}
                onChange={(e) => setCashierPassword(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black px-3.5 py-2.5 text-sm text-white"
              />
              <button type="submit" className="solid-gold-btn w-full rounded-xl py-3 text-sm font-bold cursor-pointer">
                Créer & Activer le Caissier
              </button>
            </form>

            <div className="lg:col-span-7 rounded-2xl border border-[#0066FF]/35 bg-[#060912] overflow-x-auto">
              <div className="p-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">Équipe Caissiers & Activité POS</h3>
                  <p className="text-xs text-slate-400">
                    Suivi en temps réel des ventes comptoir et validations par caissier.
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('/caissier')}
                  className="electric-glow-btn rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer"
                >
                  Ouvrir Portail Caissier
                </button>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 text-slate-400">
                  <tr>
                    <th className="p-4">Caissier</th>
                    <th className="p-4">Guichet / Station</th>
                    <th className="p-4 text-right">Aujourd’hui</th>
                    <th className="p-4 text-right">Total Encaissé</th>
                    <th className="p-4 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {cashiersList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        Aucun caissier enregistré pour le moment. Utilisez le formulaire ci-contre ou attribuez le rôle « cashier ».
                      </td>
                    </tr>
                  ) : (
                    cashiersList.map((c) => (
                      <tr key={c.id}>
                        <td className="p-4">
                          <div className="font-semibold text-white">{c.fullName}</div>
                          <div className="text-slate-400">{c.email} · {c.phone || '—'}</div>
                        </td>
                        <td className="p-4">
                          <input
                            type="text"
                            defaultValue={c.cashierStation || 'Guichet Central'}
                            onBlur={(e) => handleToggleUserStatus(c.id, c.isActive, e.target.value)}
                            className="w-40 rounded-lg border border-white/10 bg-black px-2.5 py-1.5 text-xs text-white"
                          />
                        </td>
                        <td className="p-4 text-right font-mono tabular-nums">
                          <div className="text-[#D4AF37] font-bold">
                            {c.todayCollectedHtg.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} HTG
                          </div>
                          <div className="text-slate-400">{c.todayOrdersCount} ventes</div>
                        </td>
                        <td className="p-4 text-right font-mono tabular-nums">
                          <div className="text-white font-semibold">${c.totalCollectedUsd.toFixed(2)} USD</div>
                          <div className="text-slate-400">{c.totalOrdersCount} op.</div>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleToggleUserStatus(c.id, !c.isActive)}
                            className={`rounded-lg px-3 py-1.5 font-semibold cursor-pointer ${
                              c.isActive
                                ? 'bg-[#0066FF] text-white'
                                : 'border border-red-500/40 bg-red-500/10 text-red-300'
                            }`}
                          >
                            {c.isActive ? 'Actif' : 'Suspendu'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4B. DEDICATED MONCASH & NATCASH APIs & CODES CONFIGURATION */}
      {section === 'gateways' && (
        <div className="space-y-6">
          {/* Info Banner: Safe to configure later */}
          <div className="rounded-2xl border border-[#D4AF37]/40 bg-[#060912] p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">
                Configuration différée possible — Mode manuel déjà opérationnel
              </div>
              <h2 className="font-display text-lg font-bold text-white">
                APIs, Codes Marchands & Identifiants MonCash / NatCash
              </h2>
              <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                Si vous n’avez pas encore reçu vos clés API ou codes marchands officiels Digicel / Natcom, laissez les
                champs API vides : la boutique continue d’encaisser via <span className="text-white font-semibold">validation manuelle sécurisée par référence</span>.
                Toutes les clés saisies ici sont chiffrées en AES-256-GCM dans la base de données.
              </p>
            </div>
            <div className="shrink-0 rounded-xl border border-[#0066FF]/35 bg-black p-3 space-y-1.5 min-w-[260px]">
              <div className="text-[11px] font-semibold text-[#3B9EFF]">URL Webhook à communiquer (MonCash / NatCash)</div>
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-[11px] text-slate-200 truncate max-w-[230px]">
                  {gatewaysConfig?.webhookEndpoint || '/api/webhooks/payment'}
                </code>
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-white hover:bg-white/10 cursor-pointer shrink-0"
                >
                  <Copy className="w-3 h-3 text-[#D4AF37]" />
                  Copier
                </button>
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-6">
            {/* MONCASH CARD */}
            <form
              onSubmit={(e) => handleSaveGateway('moncash', e)}
              className="rounded-2xl border border-[#0066FF]/35 bg-[#060912] p-6 space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#3B9EFF]">
                    Passerelle Digicel Haïti
                  </div>
                  <h3 className="font-display text-xl font-bold text-white mt-0.5">MonCash API & Code Marchand</h3>
                </div>
                <div className="text-right">
                  <div
                    className={`font-mono text-xs font-bold ${
                      gatewaysConfig?.moncash.autoApiActive
                        ? 'text-emerald-400'
                        : gatewaysConfig?.moncash.autoApiConfigured
                        ? 'text-[#3B9EFF]'
                        : 'text-[#D4AF37]'
                    }`}
                  >
                    {gatewaysConfig?.moncash.autoApiActive
                      ? 'API Automatique Active'
                      : gatewaysConfig?.moncash.autoApiConfigured
                      ? 'Clés prêtes · Mode Manuel'
                      : 'En attente des clés · Mode Manuel'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Env : <span className="font-mono text-slate-200 uppercase">{mcEnv}</span>
                  </div>
                </div>
              </div>

              {/* Public Merchant Info & Codes */}
              <div className="grid sm:grid-cols-2 gap-3.5">
                <label className="text-xs text-slate-300">
                  Numéro téléphone MonCash
                  <input
                    type="text"
                    required
                    value={moncashNum}
                    onChange={(e) => setMoncashNum(e.target.value)}
                    placeholder="+509 3700-0000"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-sm text-white focus:border-[#0066FF] focus:outline-none"
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Code Marchand / USSD (optionnel)
                  <input
                    type="text"
                    value={mcCode}
                    onChange={(e) => setMcCode(e.target.value)}
                    placeholder="Ex: *202*... ou MC-KALSU"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-sm text-[#D4AF37] focus:border-[#D4AF37] focus:outline-none"
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Nom du compte affiché
                  <input
                    type="text"
                    required
                    value={moncashName}
                    onChange={(e) => setMoncashName(e.target.value)}
                    placeholder="KAL-SU GIFT HAITI"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white focus:border-[#0066FF] focus:outline-none"
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Frais MonCash (%)
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="25"
                    value={moncashFee}
                    onChange={(e) => setMoncashFee(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-sm text-white focus:border-[#0066FF] focus:outline-none"
                  />
                </label>
              </div>

              {/* API Mode & Endpoint */}
              <div className="border-t border-white/10 pt-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Identifiants API MonCash (à remplir dès réception)</span>
                  <button
                    type="button"
                    onClick={() => setShowMcSecrets((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showMcSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showMcSecrets ? 'Masquer' : 'Afficher'}
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-3.5">
                  <label className="text-xs text-slate-300">
                    Environnement
                    <select
                      value={mcEnv}
                      onChange={(e) => {
                        const nextEnv = e.target.value === 'production' ? 'production' : 'sandbox';
                        setMcEnv(nextEnv);
                        if (
                          !mcApiUrl ||
                          mcApiUrl.includes('moncashbutton.digicelgroup.com')
                        ) {
                          setMcApiUrl(
                            nextEnv === 'production'
                              ? 'https://moncashbutton.digicelgroup.com/Api'
                              : 'https://sandbox.moncashbutton.digicelgroup.com/Api'
                          );
                        }
                      }}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white"
                    >
                      <option value="sandbox">Sandbox (Test Digicel)</option>
                      <option value="production">Production (Live Haïti)</option>
                    </select>
                  </label>

                  <label className="text-xs text-slate-300">
                    Mode de vérification paiements
                    <select
                      value={mcMode}
                      onChange={(e) => setMcMode(e.target.value === 'auto_api' ? 'auto_api' : 'manual')}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white"
                    >
                      <option value="manual">Validation manuelle (Admin / Caissier)</option>
                      <option value="auto_api">Automatique via API MonCash (si clés OK)</option>
                    </select>
                  </label>
                </div>

                <label className="block text-xs text-slate-300">
                  URL API MonCash
                  <input
                    type="url"
                    value={mcApiUrl}
                    onChange={(e) => setMcApiUrl(e.target.value)}
                    placeholder="https://sandbox.moncashbutton.digicelgroup.com/Api"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-xs text-white focus:border-[#0066FF] focus:outline-none"
                  />
                </label>

                <div className="grid sm:grid-cols-2 gap-3.5">
                  <label className="text-xs text-slate-300">
                    Client ID MonCash
                    {gatewaysConfig?.moncash.hasClientId && (
                      <span className="ml-1.5 font-mono text-[10px] text-emerald-400">
                        ({gatewaysConfig.moncash.maskedClientId})
                      </span>
                    )}
                    <input
                      type={showMcSecrets ? 'text' : 'password'}
                      value={mcClientId}
                      onChange={(e) => setMcClientId(e.target.value)}
                      placeholder={
                        gatewaysConfig?.moncash.hasClientId
                          ? 'Laisser vide pour conserver l’actuel'
                          : 'À saisir plus tard...'
                      }
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-xs text-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    Client Secret MonCash
                    {gatewaysConfig?.moncash.hasClientSecret && (
                      <span className="ml-1.5 font-mono text-[10px] text-emerald-400">
                        ({gatewaysConfig.moncash.maskedClientSecret})
                      </span>
                    )}
                    <input
                      type={showMcSecrets ? 'text' : 'password'}
                      value={mcClientSecret}
                      onChange={(e) => setMcClientSecret(e.target.value)}
                      placeholder={
                        gatewaysConfig?.moncash.hasClientSecret
                          ? 'Laisser vide pour conserver l’actuel'
                          : 'À saisir plus tard...'
                      }
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-xs text-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>

                <label className="block text-xs text-slate-300">
                  Secret Signature Webhook MonCash (HMAC-SHA256)
                  {gatewaysConfig?.moncash.hasWebhookSecret && (
                    <span className="ml-1.5 font-mono text-[10px] text-emerald-400">
                      ({gatewaysConfig.moncash.maskedWebhookSecret})
                    </span>
                  )}
                  <input
                    type={showMcSecrets ? 'text' : 'password'}
                    value={mcWebhookSecret}
                    onChange={(e) => setMcWebhookSecret(e.target.value)}
                    placeholder={
                      gatewaysConfig?.moncash.hasWebhookSecret
                        ? 'Laisser vide pour conserver l’actuel'
                        : 'Optionnel — À saisir plus tard...'
                    }
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-xs text-white focus:border-[#0066FF] focus:outline-none"
                  />
                </label>
              </div>

              {gatewaysConfig?.moncash.lastTestMessage && (
                <div
                  className={`rounded-xl border p-3 text-xs ${
                    gatewaysConfig.moncash.lastTestStatus === 'success'
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                      : gatewaysConfig.moncash.lastTestStatus === 'error'
                      ? 'border-red-500/35 bg-red-500/10 text-red-300'
                      : 'border-white/10 bg-black text-slate-300'
                  }`}
                >
                  {gatewaysConfig.moncash.lastTestMessage}
                </div>
              )}

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={savingGateway === 'moncash'}
                  className="electric-glow-btn flex-1 min-w-[160px] rounded-xl py-2.5 px-4 text-xs font-bold text-white cursor-pointer"
                >
                  {savingGateway === 'moncash' ? 'Enregistrement...' : 'Enregistrer MonCash'}
                </button>
                <button
                  type="button"
                  disabled={testingGateway === 'moncash'}
                  onClick={() => handleTestGateway('moncash')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D4AF37]/45 bg-black px-4 py-2.5 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/10 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {testingGateway === 'moncash' ? 'Test...' : 'Tester API MonCash'}
                </button>
                {(gatewaysConfig?.moncash.hasClientId || gatewaysConfig?.moncash.hasClientSecret) && (
                  <button
                    type="button"
                    onClick={() => handleClearGatewaySecrets('moncash')}
                    className="rounded-xl border border-red-500/35 px-3 py-2.5 text-xs text-red-300 hover:bg-red-500/10 cursor-pointer"
                  >
                    Effacer clés
                  </button>
                )}
              </div>
            </form>

            {/* NATCASH CARD */}
            <form
              onSubmit={(e) => handleSaveGateway('natcash', e)}
              className="rounded-2xl border border-[#D4AF37]/35 bg-[#060912] p-6 space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">
                    Passerelle Natcom Haïti
                  </div>
                  <h3 className="font-display text-xl font-bold text-white mt-0.5">NatCash API & Code Marchand</h3>
                </div>
                <div className="text-right">
                  <div
                    className={`font-mono text-xs font-bold ${
                      gatewaysConfig?.natcash.autoApiActive
                        ? 'text-emerald-400'
                        : gatewaysConfig?.natcash.autoApiConfigured
                        ? 'text-[#3B9EFF]'
                        : 'text-[#D4AF37]'
                    }`}
                  >
                    {gatewaysConfig?.natcash.autoApiActive
                      ? 'API Automatique Active'
                      : gatewaysConfig?.natcash.autoApiConfigured
                      ? 'Clés prêtes · Mode Manuel'
                      : 'En attente des clés · Mode Manuel'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Env : <span className="font-mono text-slate-200 uppercase">{ncEnv}</span>
                  </div>
                </div>
              </div>

              {/* Public Merchant Info & Codes */}
              <div className="grid sm:grid-cols-2 gap-3.5">
                <label className="text-xs text-slate-300">
                  Numéro téléphone NatCash
                  <input
                    type="text"
                    required
                    value={natcashNum}
                    onChange={(e) => setNatcashNum(e.target.value)}
                    placeholder="+509 4100-0000"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Code Marchand / Short Code (optionnel)
                  <input
                    type="text"
                    value={ncCode}
                    onChange={(e) => setNcCode(e.target.value)}
                    placeholder="Ex: *202# / Code Agent"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-sm text-[#D4AF37] focus:border-[#D4AF37] focus:outline-none"
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Nom du compte affiché
                  <input
                    type="text"
                    required
                    value={natcashName}
                    onChange={(e) => setNatcashName(e.target.value)}
                    placeholder="KAL-SU GIFT NATCASH"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Frais NatCash (%)
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="25"
                    value={natcashFee}
                    onChange={(e) => setNatcashFee(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </label>
              </div>

              {/* API Mode & Endpoint */}
              <div className="border-t border-white/10 pt-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Identifiants API NatCash (à remplir dès réception)</span>
                  <button
                    type="button"
                    onClick={() => setShowNcSecrets((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showNcSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showNcSecrets ? 'Masquer' : 'Afficher'}
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-3.5">
                  <label className="text-xs text-slate-300">
                    Environnement
                    <select
                      value={ncEnv}
                      onChange={(e) => setNcEnv(e.target.value === 'production' ? 'production' : 'sandbox')}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white"
                    >
                      <option value="sandbox">Sandbox (Test Natcom)</option>
                      <option value="production">Production (Live Haïti)</option>
                    </select>
                  </label>

                  <label className="text-xs text-slate-300">
                    Mode de vérification paiements
                    <select
                      value={ncMode}
                      onChange={(e) => setNcMode(e.target.value === 'auto_api' ? 'auto_api' : 'manual')}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white"
                    >
                      <option value="manual">Validation manuelle (Admin / Caissier)</option>
                      <option value="auto_api">Automatique via API NatCash (si clés OK)</option>
                    </select>
                  </label>
                </div>

                <div className="grid sm:grid-cols-2 gap-3.5">
                  <label className="text-xs text-slate-300">
                    Merchant ID / Partner Code API
                    <input
                      type="text"
                      value={ncMerchantId}
                      onChange={(e) => setNcMerchantId(e.target.value)}
                      placeholder="Ex: NC-PARTNER-1042"
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    URL API NatCash (Endpoint Natcom)
                    <input
                      type="url"
                      value={ncApiUrl}
                      onChange={(e) => setNcApiUrl(e.target.value)}
                      placeholder="https://api.natcash.natcom.ht/..."
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="grid sm:grid-cols-2 gap-3.5">
                  <label className="text-xs text-slate-300">
                    API Key NatCash
                    {gatewaysConfig?.natcash.hasApiKey && (
                      <span className="ml-1.5 font-mono text-[10px] text-emerald-400">
                        ({gatewaysConfig.natcash.maskedApiKey})
                      </span>
                    )}
                    <input
                      type={showNcSecrets ? 'text' : 'password'}
                      value={ncApiKey}
                      onChange={(e) => setNcApiKey(e.target.value)}
                      placeholder={
                        gatewaysConfig?.natcash.hasApiKey
                          ? 'Laisser vide pour conserver l’actuelle'
                          : 'À saisir plus tard...'
                      }
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    API Secret NatCash
                    {gatewaysConfig?.natcash.hasApiSecret && (
                      <span className="ml-1.5 font-mono text-[10px] text-emerald-400">
                        ({gatewaysConfig.natcash.maskedApiSecret})
                      </span>
                    )}
                    <input
                      type={showNcSecrets ? 'text' : 'password'}
                      value={ncApiSecret}
                      onChange={(e) => setNcApiSecret(e.target.value)}
                      placeholder={
                        gatewaysConfig?.natcash.hasApiSecret
                          ? 'Laisser vide pour conserver l’actuel'
                          : 'À saisir plus tard...'
                      }
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </label>
                </div>

                <label className="block text-xs text-slate-300">
                  Secret Signature Webhook NatCash (HMAC-SHA256)
                  {gatewaysConfig?.natcash.hasWebhookSecret && (
                    <span className="ml-1.5 font-mono text-[10px] text-emerald-400">
                      ({gatewaysConfig.natcash.maskedWebhookSecret})
                    </span>
                  )}
                  <input
                    type={showNcSecrets ? 'text' : 'password'}
                    value={ncWebhookSecret}
                    onChange={(e) => setNcWebhookSecret(e.target.value)}
                    placeholder={
                      gatewaysConfig?.natcash.hasWebhookSecret
                        ? 'Laisser vide pour conserver l’actuel'
                        : 'Optionnel — À saisir plus tard...'
                    }
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 font-mono text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </label>
              </div>

              {gatewaysConfig?.natcash.lastTestMessage && (
                <div
                  className={`rounded-xl border p-3 text-xs ${
                    gatewaysConfig.natcash.lastTestStatus === 'success'
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                      : gatewaysConfig.natcash.lastTestStatus === 'error'
                      ? 'border-red-500/35 bg-red-500/10 text-red-300'
                      : 'border-white/10 bg-black text-slate-300'
                  }`}
                >
                  {gatewaysConfig.natcash.lastTestMessage}
                </div>
              )}

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={savingGateway === 'natcash'}
                  className="solid-gold-btn flex-1 min-w-[160px] rounded-xl py-2.5 px-4 text-xs font-bold cursor-pointer"
                >
                  {savingGateway === 'natcash' ? 'Enregistrement...' : 'Enregistrer NatCash'}
                </button>
                <button
                  type="button"
                  disabled={testingGateway === 'natcash'}
                  onClick={() => handleTestGateway('natcash')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#0066FF]/45 bg-black px-4 py-2.5 text-xs font-semibold text-[#3B9EFF] hover:bg-[#0066FF]/10 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {testingGateway === 'natcash' ? 'Test...' : 'Tester API NatCash'}
                </button>
                {(gatewaysConfig?.natcash.hasApiKey || gatewaysConfig?.natcash.hasApiSecret) && (
                  <button
                    type="button"
                    onClick={() => handleClearGatewaySecrets('natcash')}
                    className="rounded-xl border border-red-500/35 px-3 py-2.5 text-xs text-red-300 hover:bg-red-500/10 cursor-pointer"
                  >
                    Effacer clés
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. SUPPLIERS API */}
      {section === 'suppliers' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-12 gap-6">
            <form onSubmit={handleAddSupplier} className="lg:col-span-5 rounded-2xl border border-[#0066FF]/25 bg-[#060912] p-6 space-y-3.5">
              <h3 className="font-display text-lg font-semibold text-white">Connecter un fournisseur API</h3>
              <input
                type="text"
                required
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                placeholder="Nom fournisseur (ex: Reloadly / Ding)"
                className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2.5 text-sm text-white"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={supCode}
                  onChange={(e) => setSupCode(e.target.value)}
                  placeholder="Code (SUP_MAIN)"
                  className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2.5 text-sm font-mono uppercase text-white"
                />
                <select
                  value={supPriority}
                  onChange={(e) => setSupPriority(e.target.value === 'secondary' ? 'secondary' : 'primary')}
                  className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2.5 text-sm text-white"
                >
                  <option value="primary">Principal (Primary)</option>
                  <option value="secondary">Secondaire (Backup)</option>
                </select>
              </div>
              <input
                type="url"
                required
                value={supUrl}
                onChange={(e) => setSupUrl(e.target.value)}
                placeholder="https://api.fournisseur.com/v1"
                className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2.5 text-sm text-white"
              />
              <input
                type="password"
                required
                value={supKey}
                onChange={(e) => setSupKey(e.target.value)}
                placeholder="Clé API (chiffrée AES-256 côté serveur)"
                className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2.5 text-sm text-white"
              />
              <select
                value={supAuth}
                onChange={(e) => setSupAuth(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2.5 text-sm text-white"
              >
                <option value="bearer">Authorization: Bearer</option>
                <option value="x_api_key">X-API-Key Header</option>
                <option value="basic">Basic Auth</option>
              </select>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={supDls} onChange={(e) => setSupDls(e.target.checked)} />
                Supporte la recharge Dream League Soccer (Player ID)
              </label>
              <button type="submit" className="electric-glow-btn w-full rounded-xl py-3 text-sm font-semibold text-white cursor-pointer">
                Enregistrer le fournisseur
              </button>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {suppliers.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[#060912] p-8 text-center text-sm text-slate-400">
                  Aucun fournisseur API connecté. Les commandes passent en livraison manuelle sécurisée.
                </div>
              ) : (
                suppliers.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-[#0066FF]/20 bg-[#060912] p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="font-mono text-[#D4AF37]">{s.code}</span>
                          <span>·</span>
                          <span className="uppercase">{s.priority}</span>
                          <span>·</span>
                          <span className={s.isActive ? 'text-emerald-400' : 'text-red-400'}>
                            {s.isActive ? 'Actif' : 'Désactivé'}
                          </span>
                          {s.supportsDls && (
                            <>
                              <span>·</span>
                              <span className="text-[#60A5FA]">DLS Compatible</span>
                            </>
                          )}
                        </div>
                        <h4 className="font-semibold text-white">{s.name}</h4>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">
                          {s.apiUrl} · Clé: {s.maskedApiKey}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleTestSupplier(s.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10 cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" /> Tester
                        </button>
                        <button
                          onClick={() => handleSyncSupplier(s.id)}
                          className="electric-glow-btn inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Sync
                        </button>
                        <button
                          onClick={() => handleToggleSupplier(s)}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                        >
                          {s.isActive ? 'Désactiver' : 'Activer'}
                        </button>
                      </div>
                    </div>
                    {s.lastTestMessage && (
                      <div className={`text-xs ${s.lastTestStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                        Dernier test : {s.lastTestMessage}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {supplierProducts.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#060912] overflow-x-auto">
              <div className="p-4 border-b border-white/10 font-semibold text-white text-sm">
                Correspondance Produits Fournisseurs ↔ KAL-SU GIFT
              </div>
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 text-slate-400">
                  <tr>
                    <th className="p-4">SKU Externe</th>
                    <th className="p-4">Nom Fournisseur</th>
                    <th className="p-4 text-right">Coût USD</th>
                    <th className="p-4">Variante KAL-SU GIFT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {supplierProducts.map((sp) => (
                    <tr key={sp.id}>
                      <td className="p-4 font-mono text-[#D4AF37]">{sp.externalSku}</td>
                      <td className="p-4 text-white">{sp.externalName} ({sp.regionCode})</td>
                      <td className="p-4 text-right font-mono text-white">${sp.supplierPriceUsd}</td>
                      <td className="p-4">
                        <select
                          value={sp.productVariantId || ''}
                          onChange={(e) =>
                            handleMapSupplierProduct(sp.id, e.target.value ? Number(e.target.value) : null)
                          }
                          className="rounded-lg border border-white/10 bg-[#000000] px-2.5 py-1.5 text-xs text-white"
                        >
                          <option value="">Non mappé</option>
                          {allVariants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.productName} — {v.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 6. CATALOG & MARGINS */}
      {section === 'catalog' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-12 gap-6">
            <form onSubmit={handleCreateCategory} className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#060912] p-6 space-y-3">
              <h3 className="font-display text-base font-semibold text-white">Nouvelle catégorie</h3>
              <input
                type="text"
                required
                placeholder="Nom catégorie (ex: Cartes Streaming)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm text-white"
              />
              <select
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value === 'gaming_topup' ? 'gaming_topup' : 'gift_card')}
                className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm text-white"
              >
                <option value="gift_card">Cartes Cadeaux</option>
                <option value="gaming_topup">Recharges Gaming</option>
              </select>
              <button type="submit" className="electric-glow-btn w-full rounded-xl py-2.5 text-xs font-semibold text-white cursor-pointer">
                Créer catégorie
              </button>
            </form>

            <form onSubmit={handleCreateProduct} className="lg:col-span-8 rounded-2xl border border-[#0066FF]/25 bg-[#060912] p-6 grid sm:grid-cols-3 gap-3">
              <h3 className="sm:col-span-3 font-display text-base font-semibold text-white">Ajouter un produit</h3>
              <input type="text" required placeholder="Nom du produit" value={newProdName} onChange={(e) => setNewProdName(e.target.value)} className="rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm text-white" />
              <input type="text" required placeholder="Marque (ex: Steam)" value={newProdBrand} onChange={(e) => setNewProdBrand(e.target.value)} className="rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm text-white" />
              <select value={newProdCatId} onChange={(e) => setNewProdCatId(Number(e.target.value))} className="rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm text-white">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nameFr}</option>)}
              </select>
              <input type="text" required placeholder="Région compatible" value={newProdRegion} onChange={(e) => setNewProdRegion(e.target.value)} className="rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm text-white" />
              <input type="number" step="0.01" required placeholder="Coût fournisseur USD" value={newProdCost} onChange={(e) => setNewProdCost(e.target.value)} className="rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm font-mono text-white" />
              <div className="flex gap-2">
                <input type="number" step="0.01" required placeholder="Prix USD" value={newProdPrice} onChange={(e) => setNewProdPrice(e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm font-mono text-white" />
                <input type="number" step="0.1" placeholder="Marge %" value={newProdMargin} onChange={(e) => setNewProdMargin(e.target.value)} className="w-20 rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm font-mono text-white" />
              </div>
              <button type="submit" className="gold-shimmer-btn sm:col-span-3 rounded-xl py-2.5 text-sm font-bold cursor-pointer">
                Publier le produit
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#060912] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="p-4 font-medium">Produit & Forfait</th>
                  <th className="p-4 font-medium">Visibilité</th>
                  <th className="p-4 font-medium text-right">Coût Fourn.</th>
                  <th className="p-4 font-medium text-right">Prix USD</th>
                  <th className="p-4 font-medium text-right">Prix HTG</th>
                  <th className="p-4 font-medium text-right">Marge est.</th>
                  <th className="p-4 font-medium">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {products.flatMap((p) =>
                  p.variants.map((v, idx) => {
                    const margin = Number(v.sellingPriceUsd) - Number(v.supplierCostUsd);
                    const priceHtg = Number(v.sellingPriceUsd) * exchangeRate;
                    return (
                      <tr key={v.id}>
                        <td className="p-4 text-white font-medium">
                          {p.name} — {v.label}
                          <div className="text-[11px] text-slate-400">{p.compatibleRegions}</div>
                        </td>
                        <td className="p-4">
                          {idx === 0 && (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleToggleProductFlag(p.id, 'isPopular', !p.isPopular)}
                                className={`rounded px-2 py-0.5 text-[10px] cursor-pointer ${
                                  p.isPopular ? 'bg-[#D4AF37] text-[#000000] font-bold' : 'bg-white/5 text-slate-400'
                                }`}
                              >
                                Pop
                              </button>
                              <button
                                onClick={() => handleToggleProductFlag(p.id, 'isPromo', !p.isPromo)}
                                className={`rounded px-2 py-0.5 text-[10px] cursor-pointer ${
                                  p.isPromo ? 'bg-[#0066FF] text-white font-bold' : 'bg-white/5 text-slate-400'
                                }`}
                              >
                                Promo
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <input
                            type="number"
                            step="0.05"
                            defaultValue={Number(v.supplierCostUsd).toFixed(2)}
                            onBlur={(e) => handleUpdateVariantField(v.id, { supplierCostUsd: e.target.value })}
                            className="w-20 rounded-lg border border-white/10 bg-[#000000] px-2 py-1 text-right font-mono text-slate-300"
                          />
                        </td>
                        <td className="p-4 text-right">
                          <input
                            type="number"
                            step="0.05"
                            defaultValue={Number(v.sellingPriceUsd).toFixed(2)}
                            onBlur={(e) => handleUpdateVariantField(v.id, { sellingPriceUsd: e.target.value })}
                            className="w-20 rounded-lg border border-white/10 bg-[#000000] px-2 py-1 text-right font-mono text-[#D4AF37]"
                          />
                        </td>
                        <td className="p-4 text-right font-mono text-slate-300">
                          {priceHtg.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} HTG
                        </td>
                        <td className="p-4 text-right font-mono text-emerald-400">+${margin.toFixed(2)}</td>
                        <td className="p-4">
                          <select
                            defaultValue={v.stockStatus}
                            onChange={(e) => handleUpdateVariantField(v.id, { stockStatus: e.target.value })}
                            className="rounded-lg border border-white/10 bg-[#000000] px-2 py-1 text-xs text-white"
                          >
                            <option value="in_stock">En stock</option>
                            <option value="manual_delivery">Livraison manuelle</option>
                            <option value="low_stock">Stock faible</option>
                            <option value="out_of_stock">Rupture</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. PROMOTIONS & COUPONS */}
      {section === 'promotions' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <form onSubmit={handleCreatePromotion} className="rounded-2xl border border-[#0066FF]/25 bg-[#060912] p-6 space-y-3">
              <h3 className="font-display text-lg font-semibold text-white">Créer une promotion</h3>
              <input type="text" required placeholder="Titre de l’offre" value={promoTitle} onChange={(e) => setPromoTitle(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm text-white" />
              <input type="number" required min="1" max="80" placeholder="% Réduction" value={promoDiscount} onChange={(e) => setPromoDiscount(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 font-mono text-sm text-white" />
              <button type="submit" className="electric-glow-btn w-full rounded-xl py-2.5 text-xs font-semibold text-white cursor-pointer">
                Activer promotion
              </button>
            </form>

            <div className="rounded-2xl border border-white/10 bg-[#060912] p-5 space-y-3">
              <h4 className="font-semibold text-white text-sm">Promotions enregistrées</h4>
              {promotionsList.map((pr) => (
                <div key={pr.id} className="flex items-center justify-between border-b border-white/5 pb-2.5 text-xs">
                  <div>
                    <div className="font-semibold text-white">{pr.titleFr} (-{pr.discountPercent}%)</div>
                    <div className="text-slate-400">{pr.descriptionFr}</div>
                  </div>
                  <button
                    onClick={() => handleTogglePromo(pr.id, !pr.isActive)}
                    className={`rounded-lg px-2.5 py-1 font-semibold cursor-pointer ${
                      pr.isActive ? 'bg-emerald-600 text-white' : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {pr.isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <form onSubmit={handleCreateCoupon} className="rounded-2xl border border-[#D4AF37]/25 bg-[#060912] p-6 space-y-3">
              <h3 className="font-display text-lg font-semibold text-white">Créer un code promo</h3>
              <div className="grid grid-cols-3 gap-2">
                <input type="text" required placeholder="CODE (HAITI20)" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} className="rounded-xl border border-white/10 bg-[#000000] px-3 py-2 font-mono uppercase text-sm text-white" />
                <select value={couponType} onChange={(e) => setCouponType(e.target.value === 'fixed_usd' ? 'fixed_usd' : 'percent')} className="rounded-xl border border-white/10 bg-[#000000] px-2 py-2 text-xs text-white">
                  <option value="percent">% Pourcent</option>
                  <option value="fixed_usd">$ USD Fixe</option>
                </select>
                <input type="number" required placeholder="Valeur" value={couponVal} onChange={(e) => setCouponVal(e.target.value)} className="rounded-xl border border-white/10 bg-[#000000] px-3 py-2 font-mono text-sm text-white" />
              </div>
              <button type="submit" className="gold-shimmer-btn w-full rounded-xl py-2.5 text-xs font-bold cursor-pointer">
                Créer le coupon
              </button>
            </form>

            <div className="rounded-2xl border border-white/10 bg-[#060912] p-5 space-y-3">
              <h4 className="font-semibold text-white text-sm">Coupons existants</h4>
              {couponsList.map((cp) => (
                <div key={cp.id} className="flex items-center justify-between border-b border-white/5 pb-2.5 text-xs">
                  <div>
                    <span className="font-mono font-bold text-[#D4AF37]">{cp.code}</span>
                    <span className="ml-2 text-slate-300">
                      ({cp.discountType === 'percent' ? `${cp.discountValue}%` : `$${cp.discountValue}`}) · {cp.usedCount}/{cp.maxUses}
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggleCoupon(cp.id, !cp.isActive)}
                    className={`rounded-lg px-2.5 py-1 font-semibold cursor-pointer ${
                      cp.isActive ? 'bg-emerald-600 text-white' : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {cp.isActive ? 'Actif' : 'Désactivé'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 8. FINANCE & SETTINGS */}
      {section === 'finance' && kpis && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#0066FF]/25 bg-[#060912] p-6">
            <div>
              <h3 className="font-display text-lg font-semibold text-white">Bilan financier & Comptabilité</h3>
              <p className="text-xs text-slate-400">
                MonCash: {moncashOrdersCount} cmd · NatCash: {natcashOrdersCount} cmd · Frais passerelles: ${kpis.totalPaymentFeesUsd.toFixed(2)} · Remboursements: ${kpis.totalRefundsUsd.toFixed(2)}
              </p>
            </div>
            <button
              onClick={handleExportFinanceCsv}
              className="gold-shimmer-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Télécharger CSV
            </button>
          </div>

          <form onSubmit={handleUpdateSettings} className="rounded-2xl border border-white/10 bg-[#060912] p-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <h3 className="sm:col-span-2 lg:col-span-4 font-display text-lg font-semibold text-white">
              Configuration marchande MonCash, NatCash & Support
            </h3>
            <label className="text-xs text-slate-300">
              Numéro MonCash
              <input type="text" value={moncashNum} onChange={(e) => setMoncashNum(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 font-mono text-white" />
            </label>
            <label className="text-xs text-slate-300">
              Nom compte MonCash
              <input type="text" value={moncashName} onChange={(e) => setMoncashName(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-white" />
            </label>
            <label className="text-xs text-slate-300">
              Frais MonCash (%)
              <input type="number" step="0.1" value={moncashFee} onChange={(e) => setMoncashFee(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 font-mono text-white" />
            </label>
            <label className="text-xs text-slate-300">
              WhatsApp Support
              <input type="text" value={whatsappNum} onChange={(e) => setWhatsappNum(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 font-mono text-white" />
            </label>

            <label className="text-xs text-slate-300">
              Numéro NatCash
              <input type="text" value={natcashNum} onChange={(e) => setNatcashNum(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 font-mono text-white" />
            </label>
            <label className="text-xs text-slate-300">
              Nom compte NatCash
              <input type="text" value={natcashName} onChange={(e) => setNatcashName(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-white" />
            </label>
            <label className="text-xs text-slate-300">
              Frais NatCash (%)
              <input type="number" step="0.1" value={natcashFee} onChange={(e) => setNatcashFee(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 font-mono text-white" />
            </label>
            <label className="text-xs text-slate-300">
              Email Support
              <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-white" />
            </label>

            <button type="submit" className="electric-glow-btn sm:col-span-2 lg:col-span-4 rounded-xl py-3 text-sm font-semibold text-white cursor-pointer">
              Enregistrer les paramètres financiers
            </button>
          </form>
        </div>
      )}

      {/* 9. SUPPORT TICKETS */}
      {section === 'tickets' && (
        <div className="space-y-4">
          {tickets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#060912] p-8 text-center text-sm text-slate-400">
              Aucun ticket de support ouvert.
            </div>
          ) : (
            tickets.map((tk) => (
              <div key={tk.id} className="rounded-2xl border border-[#0066FF]/20 bg-[#060912] p-5 space-y-3">
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <span className="font-mono font-bold text-[#D4AF37]">{tk.ticketRef} · {tk.category}</span>
                  <span className="uppercase text-[#60A5FA]">{tk.status}</span>
                </div>
                <div className="font-semibold text-white text-sm">{tk.subject}</div>
                <p className="text-xs text-slate-300">{tk.message}</p>
                {tk.adminReply && (
                  <div className="rounded-lg bg-[#000000] p-3 text-xs text-emerald-300">
                    Réponse envoyée : {tk.adminReply}
                  </div>
                )}

                {replyTicketId === tk.id ? (
                  <form onSubmit={handleReplyTicket} className="space-y-2 pt-2">
                    <textarea
                      required
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Votre réponse au client..."
                      className="w-full rounded-xl border border-white/10 bg-[#000000] p-3 text-xs text-white"
                    />
                    <div className="flex gap-2">
                      <select value={replyStatus} onChange={(e) => setReplyStatus(e.target.value)} className="rounded-lg border border-white/10 bg-[#000000] px-3 py-1.5 text-xs text-white">
                        <option value="in_progress">En cours</option>
                        <option value="resolved">Résolu</option>
                        <option value="closed">Fermé</option>
                      </select>
                      <button type="submit" className="electric-glow-btn rounded-lg px-4 py-1.5 text-xs font-semibold text-white cursor-pointer">
                        Envoyer réponse
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => {
                      setReplyTicketId(tk.id);
                      setReplyText(tk.adminReply || '');
                    }}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10 cursor-pointer"
                  >
                    Répondre / Changer statut
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* 10. CUSTOMERS, RBAC & SECURITY AUDIT */}
      {section === 'security' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#0066FF]/20 bg-[#060912] overflow-x-auto">
            <div className="p-4 border-b border-white/10 flex items-center gap-2 font-semibold text-white text-sm">
              <Users className="w-4 h-4 text-[#3B82F6]" />
              Clients & Attribution des Rôles RBAC
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="p-4">Utilisateur</th>
                  <th className="p-4">Email & Téléphone</th>
                  <th className="p-4 text-right">Points</th>
                  <th className="p-4">Rôle RBAC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="p-4 font-medium text-white">
                      {c.fullName}
                      {c.cashierStation && (
                        <div className="text-[11px] text-[#3B9EFF]">{c.cashierStation}</div>
                      )}
                    </td>
                    <td className="p-4 text-slate-300">{c.email} · {c.phone || '—'}</td>
                    <td className="p-4 text-right font-mono text-[#D4AF37] tabular-nums">{c.loyaltyPoints}</td>
                    <td className="p-4 flex items-center gap-2">
                      <select
                        value={c.roleId}
                        onChange={(e) => handleRoleChange(c.id, Number(e.target.value))}
                        className="rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-xs text-white"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleToggleUserStatus(c.id, !c.isActive)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${
                          c.isActive
                            ? 'border border-white/15 text-slate-300 hover:text-white'
                            : 'border border-red-500/40 bg-red-500/10 text-red-300'
                        }`}
                      >
                        {c.isActive ? 'Actif' : 'Suspendu'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#060912] overflow-x-auto">
            <div className="p-4 border-b border-white/10 flex items-center gap-2 font-semibold text-white text-sm">
              <Shield className="w-4 h-4 text-[#D4AF37]" />
              Journal d’Audit Sécurité & Opérations
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Entité</th>
                  <th className="p-4">Identifiant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="p-4 font-mono text-slate-400">{new Date(log.createdAt).toLocaleString('fr-FR')}</td>
                    <td className="p-4 font-semibold text-white">{log.action}</td>
                    <td className="p-4 text-slate-300">{log.entityType}</td>
                    <td className="p-4 font-mono text-[#D4AF37]">{log.entityId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </main>
      </div>
    </div>
  );
};
