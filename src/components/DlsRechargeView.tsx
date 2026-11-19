import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, Trophy, ArrowRight, AlertTriangle } from 'lucide-react';
import { formatMoney } from '../i18n/translations.ts';
import type {
  CurrencyCode,
  DlsCompatibility,
  LangCode,
  MerchantConfig,
  OrderRecord,
  Product,
  UserProfile,
} from '../types.ts';

interface DlsRechargeViewProps {
  dlsProduct: Product | undefined;
  dlsCompatibility: DlsCompatibility;
  lang: LangCode;
  currency: CurrencyCode;
  exchangeRate: number;
  merchantConfig: MerchantConfig;
  profile: UserProfile | null;
  getAuthHeader: () => Promise<string | null>;
  onRequireAuth: () => void;
  onOrderCreated: () => void;
}

export const DlsRechargeView: React.FC<DlsRechargeViewProps> = ({
  dlsProduct,
  dlsCompatibility,
  lang,
  currency,
  exchangeRate,
  merchantConfig,
  profile,
  getAuthHeader,
  onRequireAuth,
  onOrderCreated,
}) => {
  const variants = dlsProduct?.variants || [];
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(variants[0]?.id ?? null);
  const [playerId, setPlayerId] = useState('');
  const [playerIdConfirm, setPlayerIdConfirm] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(currency);
  const [paymentMethod, setPaymentMethod] = useState<'moncash' | 'natcash'>('moncash');
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [transactionRef, setTransactionRef] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeVariant = variants.find((v) => v.id === selectedVariantId) || variants[0];
  const priceUsd = activeVariant ? Number(activeVariant.promoPriceUsd || activeVariant.sellingPriceUsd) : 0;
  const feePct = paymentMethod === 'moncash' ? merchantConfig.moncashFeePercent : merchantConfig.natcashFeePercent;
  const feeUsd = (priceUsd * feePct) / 100;
  const totalUsd = priceUsd + feeUsd;

  const handleConfirmDlsOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!profile) {
      onRequireAuth();
      return;
    }
    if (!activeVariant) return;
    if (!playerId.trim() || playerId.trim() !== playerIdConfirm.trim()) {
      setError(
        lang === 'es'
          ? 'Los dos campos de Player ID deben ser idénticos.'
          : lang === 'en'
          ? 'Both Player ID fields must match identically.'
          : 'Le Player ID et sa confirmation doivent être identiques.'
      );
      return;
    }

    setLoading(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        onRequireAuth();
        return;
      }
      const resp = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({
          variantId: activeVariant.id,
          quantity: 1,
          currency: selectedCurrency,
          paymentMethod,
          playerId: playerId.trim(),
          playerIdConfirmed: playerIdConfirm.trim(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erreur création commande DLS');
      setOrder(data.order);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
    } finally {
      setLoading(false);
    }
  };

  const handlePayDls = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setError('');
    setLoading(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;
      const resp = await fetch(`/api/orders/${order.orderRef}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ method: paymentMethod, transactionRef }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erreur paiement');
      setSubmitted(true);
      onOrderCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur paiement');
    } finally {
      setLoading(false);
    }
  };

  const merchantNumber =
    paymentMethod === 'moncash' ? merchantConfig.moncashNumber : merchantConfig.natcashNumber;
  const merchantCode =
    paymentMethod === 'moncash'
      ? merchantConfig.moncashMerchantCode
      : merchantConfig.natcashMerchantCode;

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8">
      {/* Spotlight Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#060912]">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Trophy className="w-4 h-4 text-[#D4AF37]" />
              <span>Dream League Soccer (DLS)</span>
              <span aria-hidden="true">·</span>
              <span className="text-blue-400">
                {dlsCompatibility.automatedAvailable
                  ? `API active: ${dlsCompatibility.supplierName}`
                  : lang === 'es'
                  ? 'Entrega manual segura por administración'
                  : lang === 'en'
                  ? 'Verified manual admin delivery'
                  : 'Livraison manuelle sécurisée par l’administration'}
              </span>
            </div>

            <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold text-white text-balance">
              {lang === 'es'
                ? 'Recarga Dream League Soccer por Player ID'
                : lang === 'en'
                ? 'Dream League Soccer Top-Up by Player ID'
                : 'Recharge Dream League Soccer par Player ID'}
            </h1>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed max-w-xl">
              {lang === 'es'
                ? 'Selecciona tu paquete de Gemas o Monedas, ingresa y confirma tu Player ID y paga con MonCash o NatCash sin compartir jamás tu contraseña.'
                : lang === 'en'
                ? 'Pick your Gems or Coins pack, enter and confirm your Player ID, and pay with MonCash or NatCash without ever sharing your password.'
                : 'Sélectionnez votre forfait Gemmes ou Pièces, saisissez puis confirmez votre Player ID et réglez par MonCash ou NatCash sans jamais partager votre mot de passe.'}
            </p>
          </div>
          <div className="lg:col-span-5 relative min-h-[200px]">
            <img
              src="/src/assets/images/dls_stadium_spotlight_1795058562767.jpg"
              alt="Dream League Soccer stadium spotlight"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#060912] via-[#060912]/40 to-transparent" />
          </div>
        </div>
      </div>

      {/* Zero-password security bar */}
      <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-[#D4AF37] shrink-0" />
          <p className="text-xs sm:text-sm text-slate-200">
            {lang === 'es'
              ? 'Seguridad DLS: nunca ingreses ni envíes tu contraseña de juego o Facebook/Google.'
              : lang === 'en'
              ? 'DLS Security: never enter or share your game, Facebook, or Google password.'
              : 'Sécurité DLS : KAL-SU GIFT ne demande jamais votre mot de passe de compte ou Facebook/Google.'}
          </p>
        </div>
        <span className="font-mono text-xs text-blue-300">
          1 USD = {exchangeRate.toFixed(2)} HTG
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!order ? (
        <form onSubmit={handleConfirmDlsOrder} className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Left column: Pack & Player ID */}
          <div className="lg:col-span-7 space-y-6 rounded-2xl border border-white/10 bg-[#060912] p-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                1. {lang === 'es' ? 'Elige tu paquete DLS' : lang === 'en' ? 'Select DLS Pack' : 'Sélectionnez votre forfait DLS'}
              </h2>
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                {variants.map((v) => {
                  const selected = activeVariant?.id === v.id;
                  const effective = Number(v.promoPriceUsd || v.sellingPriceUsd);
                  return (
                    <button
                      type="button"
                      key={v.id}
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                        selected
                          ? 'border-[#0066FF] bg-[#0066FF]/15'
                          : 'border-white/10 bg-[#000000] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white text-sm">{v.label}</span>
                        {v.promoPriceUsd && (
                          <span className="text-[11px] font-semibold text-[#D4AF37]">PROMO</span>
                        )}
                      </div>
                      <div className="mt-1.5 font-mono text-sm font-bold text-[#D4AF37]">
                        {formatMoney(effective, selectedCurrency, exchangeRate)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-white/10 pt-5 space-y-4">
              <h2 className="font-display text-lg font-semibold text-white">
                2. {lang === 'es' ? 'Player ID DLS (obligatorio)' : lang === 'en' ? 'DLS Player ID (required)' : 'Player ID DLS (obligatoire)'}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">Player ID</span>
                  <input
                    type="text"
                    required
                    value={playerId}
                    onChange={(e) => setPlayerId(e.target.value)}
                    placeholder="Ex: DLS-94820184"
                    className="w-full rounded-xl border border-white/10 bg-[#000000] px-3.5 py-3 text-sm font-mono text-white focus:border-[#0066FF] focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">
                    {lang === 'es' ? 'Confirmar Player ID' : lang === 'en' ? 'Confirm Player ID' : 'Confirmer le Player ID'}
                  </span>
                  <input
                    type="text"
                    required
                    value={playerIdConfirm}
                    onChange={(e) => setPlayerIdConfirm(e.target.value)}
                    placeholder="Ex: DLS-94820184"
                    className="w-full rounded-xl border border-white/10 bg-[#000000] px-3.5 py-3 text-sm font-mono text-white focus:border-[#0066FF] focus:outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-white/10 pt-5 grid sm:grid-cols-2 gap-4">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-300">Devise</span>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#000000] p-1 border border-white/10">
                  {(['HTG', 'USD'] as CurrencyCode[]).map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setSelectedCurrency(c)}
                      className={`rounded-lg py-2.5 text-xs font-semibold cursor-pointer ${
                        selectedCurrency === c ? 'bg-[#0066FF] text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-300">Méthode de paiement</span>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#000000] p-1 border border-white/10">
                  {(['moncash', 'natcash'] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`rounded-lg py-2.5 text-xs font-semibold cursor-pointer ${
                        paymentMethod === m ? 'bg-[#D4AF37] text-[#000000]' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {m === 'moncash' ? 'MonCash' : 'NatCash'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right column: Summary */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#060912] p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold text-white">
              3. {lang === 'es' ? 'Resumen DLS' : lang === 'en' ? 'DLS Summary' : 'Récapitulatif DLS'}
            </h2>
            <div className="space-y-2.5 text-xs border-b border-white/10 pb-4">
              <div className="flex justify-between text-slate-400">
                <span>Forfait sélectionné</span>
                <span className="font-semibold text-white">{activeVariant?.label || '—'}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Player ID</span>
                <span className="font-mono text-white">{playerId || '—'}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Mode de livraison</span>
                <span className="text-blue-300">
                  {dlsCompatibility.automatedAvailable ? 'API Fournisseur' : 'Manuelle par Admin'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Prix forfait</span>
                <span className="font-mono text-white">{formatMoney(priceUsd, selectedCurrency, exchangeRate)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Frais {paymentMethod.toUpperCase()} ({feePct}%)</span>
                <span className="font-mono text-white">{formatMoney(feeUsd, selectedCurrency, exchangeRate)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-base font-bold text-white">
              <span>Total à payer</span>
              <span className="font-mono text-[#D4AF37]">{formatMoney(totalUsd, selectedCurrency, exchangeRate)}</span>
            </div>

            <button
              type="submit"
              disabled={loading || !activeVariant}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0066FF] py-3.5 text-sm font-semibold text-white hover:bg-[#0052CC] transition-colors cursor-pointer"
            >
              <span>
                {!profile
                  ? 'Se connecter pour recharger DLS'
                  : loading
                  ? '...'
                  : 'Créer la commande DLS'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      ) : !submitted ? (
        <form onSubmit={handlePayDls} className="max-w-xl mx-auto rounded-2xl border border-white/10 bg-[#060912] p-6 space-y-4">
          <h2 className="font-display text-xl font-bold text-white">
            Paiement {paymentMethod.toUpperCase()} — {order.orderRef}
          </h2>
          <div className="rounded-xl border border-white/10 bg-[#000000] p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Player ID</span>
              <span className="font-mono text-white">{order.playerId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Numéro marchand officiel</span>
              <span className="font-mono font-bold text-white">{merchantNumber}</span>
            </div>
            {merchantCode && (
              <div className="flex justify-between">
                <span className="text-slate-400">Code marchand / USSD</span>
                <span className="font-mono font-bold text-[#D4AF37]">{merchantCode}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Montant à envoyer</span>
              <span className="font-mono font-bold text-[#D4AF37]">
                {order.currency === 'HTG'
                  ? `${Number(order.totalHtg).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG`
                  : `$${Number(order.totalUsd).toFixed(2)} USD`}
              </span>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-300">
              Référence de transaction {paymentMethod.toUpperCase()}
            </span>
            <input
              type="text"
              required
              minLength={5}
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="Saisissez le code SMS reçu après paiement"
              className="w-full rounded-xl border border-white/10 bg-[#000000] px-3.5 py-3 text-sm font-mono uppercase text-white focus:border-[#0066FF] focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#D4AF37] py-3.5 text-sm font-bold text-[#000000] hover:bg-[#F5C451] cursor-pointer"
          >
            {loading ? '...' : 'Confirmer ma transaction'}
          </button>
        </form>
      ) : (
        <div className="max-w-xl mx-auto rounded-2xl border border-blue-500/30 bg-[#060912] p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-[#0066FF] mx-auto" />
          <h2 className="font-display text-2xl font-bold text-white">
            Recharge DLS enregistrée ({order.orderRef})
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Référence <span className="font-mono text-[#D4AF37]">{transactionRef.toUpperCase()}</span> en cours de vérification.
            Une fois validée, votre Player ID <span className="font-mono text-white">{order.playerId}</span> sera crédité et vous recevrez une notification.
          </p>
          <button
            onClick={() => {
              setOrder(null);
              setSubmitted(false);
              setTransactionRef('');
            }}
            className="rounded-xl bg-[#0066FF] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#0052CC] cursor-pointer"
          >
            Nouvelle recharge DLS
          </button>
        </div>
      )}
    </section>
  );
};
