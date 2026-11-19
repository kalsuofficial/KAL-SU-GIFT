import React, { useState } from 'react';
import { X, ShieldAlert, CheckCircle2, Globe2, Clock, CreditCard } from 'lucide-react';
import { formatMoney } from '../i18n/translations.ts';
import type {
  CurrencyCode,
  LangCode,
  MerchantConfig,
  OrderRecord,
  Product,
  UserProfile,
} from '../types.ts';

interface ProductCheckoutModalProps {
  product: Product | null;
  lang: LangCode;
  currency: CurrencyCode;
  exchangeRate: number;
  merchantConfig: MerchantConfig;
  profile: UserProfile | null;
  getAuthHeader: () => Promise<string | null>;
  onRequireAuth: () => void;
  onClose: () => void;
  onOrderCompleted: () => void;
}

export const ProductCheckoutModal: React.FC<ProductCheckoutModalProps> = ({
  product,
  lang,
  currency,
  exchangeRate,
  merchantConfig,
  profile,
  getAuthHeader,
  onRequireAuth,
  onClose,
  onOrderCompleted,
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'moncash' | 'natcash'>('moncash');
  const [checkoutCurrency, setCheckoutCurrency] = useState<CurrencyCode>(currency);
  const [couponCode, setCouponCode] = useState('');
  const [appliedDiscountUsd, setAppliedDiscountUsd] = useState(0);
  const [couponMsg, setCouponMsg] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [playerIdConfirmed, setPlayerIdConfirmed] = useState('');
  const [createdOrder, setCreatedOrder] = useState<OrderRecord | null>(null);
  const [transactionRef, setTransactionRef] = useState('');
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!product) return null;

  const variants = product.variants || [];
  const activeVariant =
    variants.find((v) => v.id === selectedVariantId) || variants[0] || null;

  const unitUsd = activeVariant
    ? Number(activeVariant.promoPriceUsd || activeVariant.sellingPriceUsd)
    : 0;
  const subtotalUsd = unitUsd * quantity;
  const netUsd = Math.max(0.5, subtotalUsd - appliedDiscountUsd);
  const feePct =
    paymentMethod === 'moncash'
      ? merchantConfig.moncashFeePercent
      : merchantConfig.natcashFeePercent;
  const feeUsd = (netUsd * feePct) / 100;
  const totalUsd = netUsd + feeUsd;

  const description =
    lang === 'es'
      ? product.descriptionEs
      : lang === 'en'
      ? product.descriptionEn
      : product.descriptionFr;
  const restrictionNote =
    lang === 'es'
      ? product.regionRestrictionNoteEs
      : lang === 'en'
      ? product.regionRestrictionNoteEn
      : product.regionRestrictionNoteFr;

  const handleApplyCoupon = async () => {
    setCouponMsg('');
    if (!couponCode.trim()) return;
    try {
      const resp = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, subtotalUsd }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setAppliedDiscountUsd(0);
        setCouponMsg(data.error || 'Code invalide');
        return;
      }
      setAppliedDiscountUsd(Number(data.discountUsd));
      setCouponMsg(`-${formatMoney(data.discountUsd, checkoutCurrency, exchangeRate)}`);
    } catch {
      setCouponMsg('Erreur réseau');
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!profile) {
      onRequireAuth();
      return;
    }
    if (!activeVariant) return;

    if (product.requiresPlayerId) {
      if (!playerId.trim() || playerId.trim() !== playerIdConfirmed.trim()) {
        setError(
          lang === 'es'
            ? 'Los dos Player ID deben coincidir exactamente.'
            : lang === 'en'
            ? 'Both Player ID entries must match exactly.'
            : 'Les deux saisies du Player ID doivent correspondre exactement.'
        );
        return;
      }
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          variantId: activeVariant.id,
          quantity,
          currency: checkoutCurrency,
          paymentMethod,
          couponCode: couponCode.trim() || undefined,
          playerId: product.requiresPlayerId ? playerId.trim() : undefined,
          playerIdConfirmed: product.requiresPlayerId ? playerIdConfirmed.trim() : undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Impossible de créer la commande');
      setCreatedOrder(data.order);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPaymentRef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdOrder) return;
    setError('');
    setLoading(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;
      const resp = await fetch(`/api/orders/${createdOrder.orderRef}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          method: paymentMethod,
          transactionRef,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Référence rejetée');
      setPaymentSubmitted(true);
      onOrderCompleted();
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
  const merchantName =
    paymentMethod === 'moncash' ? merchantConfig.moncashName : merchantConfig.natcashName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="my-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#060912] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{product.brand}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#D4AF37]">{product.compatibleRegions}</span>
              <span aria-hidden="true">·</span>
              <span>{product.deliveryTimeLabel}</span>
            </div>
            <h2 className="mt-1 font-display text-xl font-bold text-white">{product.name}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {!createdOrder ? (
          <form onSubmit={handleCreateOrder} className="mt-5 space-y-5">
            <p className="text-sm text-slate-300 leading-relaxed">{description}</p>

            {/* Region verification notice */}
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs text-amber-200 flex items-start gap-2.5">
              <Globe2 className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">
                  {lang === 'es' ? 'Región y restricciones' : lang === 'en' ? 'Region & restrictions' : 'Région & restrictions'}
                </p>
                <p className="mt-0.5 text-amber-200/90">{restrictionNote}</p>
              </div>
            </div>

            {/* Variants selector */}
            <div>
              <span className="block text-xs font-semibold text-slate-300 mb-2">
                {lang === 'es' ? 'Elige el paquete' : lang === 'en' ? 'Select package' : 'Choisissez la valeur / forfait'}
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {variants.map((v) => {
                  const isSelected = activeVariant?.id === v.id;
                  const effectiveUsd = Number(v.promoPriceUsd || v.sellingPriceUsd);
                  return (
                    <button
                      type="button"
                      key={v.id}
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-[#0066FF] bg-[#0066FF]/15'
                          : 'border-white/10 bg-[#000000] hover:border-white/25'
                      }`}
                    >
                      <div className="text-sm font-semibold text-white">{v.label}</div>
                      <div className="mt-1 font-mono text-xs text-[#D4AF37]">
                        {formatMoney(effectiveUsd, checkoutCurrency, exchangeRate)}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                        {checkoutCurrency === 'HTG'
                          ? `$${effectiveUsd.toFixed(2)} USD`
                          : `${(effectiveUsd * exchangeRate).toFixed(0)} HTG`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Player ID inputs if gaming top-up */}
            {product.requiresPlayerId && (
              <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                  <ShieldAlert className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    {lang === 'es'
                      ? 'Nunca solicitamos tu contraseña de juego.'
                      : lang === 'en'
                      ? 'We never ask for your game password.'
                      : 'KAL-SU GIFT ne demande jamais votre mot de passe.'}
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-300">Player ID</span>
                    <input
                      type="text"
                      required
                      value={playerId}
                      onChange={(e) => setPlayerId(e.target.value)}
                      placeholder="Ex: 284910472"
                      className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2.5 text-sm font-mono text-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-300">
                      {lang === 'es' ? 'Confirmar Player ID' : lang === 'en' ? 'Confirm Player ID' : 'Confirmer Player ID'}
                    </span>
                    <input
                      type="text"
                      required
                      value={playerIdConfirmed}
                      onChange={(e) => setPlayerIdConfirmed(e.target.value)}
                      placeholder="Ex: 284910472"
                      className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2.5 text-sm font-mono text-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Currency, Payment Method & Promo Code */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <span className="block text-xs font-medium text-slate-300 mb-1.5">
                  {lang === 'es' ? 'Moneda' : lang === 'en' ? 'Currency' : 'Devise'}
                </span>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#000000] p-1 border border-white/10">
                  {(['HTG', 'USD'] as CurrencyCode[]).map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setCheckoutCurrency(c)}
                      className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
                        checkoutCurrency === c ? 'bg-[#0066FF] text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-300 mb-1.5">
                  {lang === 'es' ? 'Método' : lang === 'en' ? 'Payment' : 'Paiement'}
                </span>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#000000] p-1 border border-white/10">
                  {(['moncash', 'natcash'] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`rounded-lg py-2 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                        paymentMethod === m ? 'bg-[#D4AF37] text-[#000000]' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {m === 'moncash' ? 'MonCash' : 'NatCash'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-300 mb-1.5">
                  {lang === 'es' ? 'Cantidad' : lang === 'en' ? 'Quantity' : 'Quantité'}
                </span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  className="w-full rounded-xl border border-white/10 bg-[#000000] px-3 py-2 text-sm font-mono text-white focus:border-[#0066FF] focus:outline-none"
                />
              </div>
            </div>

            {/* Coupon */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Code promo (ex: KALSU10)"
                className="flex-1 rounded-xl border border-white/10 bg-[#000000] px-3 py-2.5 text-sm font-mono uppercase text-white focus:border-[#0066FF] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/10 cursor-pointer"
              >
                {lang === 'es' ? 'Aplicar' : lang === 'en' ? 'Apply' : 'Appliquer'}
              </button>
            </div>
            {couponMsg && <p className="text-xs text-[#D4AF37]">{couponMsg}</p>}

            {/* Summary */}
            <div className="rounded-xl border border-white/10 bg-[#000000] p-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Sous-total</span>
                <span className="font-mono text-slate-200">{formatMoney(subtotalUsd, checkoutCurrency, exchangeRate)}</span>
              </div>
              {appliedDiscountUsd > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Réduction promo</span>
                  <span className="font-mono">-{formatMoney(appliedDiscountUsd, checkoutCurrency, exchangeRate)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>Frais {paymentMethod.toUpperCase()} ({feePct}%)</span>
                <span className="font-mono text-slate-200">{formatMoney(feeUsd, checkoutCurrency, exchangeRate)}</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2 text-sm font-bold text-white">
                <span>Total à payer (1 USD = {exchangeRate} HTG)</span>
                <span className="font-mono text-[#D4AF37]">{formatMoney(totalUsd, checkoutCurrency, exchangeRate)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || activeVariant?.stockStatus === 'out_of_stock'}
              className="w-full rounded-xl bg-[#0066FF] py-3.5 text-sm font-semibold text-white hover:bg-[#0052CC] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {!profile
                ? lang === 'es'
                  ? 'Inicia sesión para ordenar'
                  : lang === 'en'
                  ? 'Sign in to place order'
                  : 'Se connecter pour commander'
                : loading
                ? '...'
                : lang === 'es'
                ? 'Confirmar y pagar'
                : lang === 'en'
                ? 'Continue to Payment'
                : 'Valider et passer au paiement'}
            </button>
          </form>
        ) : !paymentSubmitted ? (
          <form onSubmit={handleSubmitPaymentRef} className="mt-5 space-y-4">
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Référence commande</span>
                <span className="font-mono font-bold text-white">{createdOrder.orderRef}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Montant exact à envoyer</span>
                <span className="font-mono font-bold text-[#D4AF37]">
                  {createdOrder.currency === 'HTG'
                    ? `${Number(createdOrder.totalHtg).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG`
                    : `$${Number(createdOrder.totalUsd).toFixed(2)} USD`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Numéro marchand {paymentMethod.toUpperCase()}</span>
                <span className="font-mono font-bold text-white">{merchantNumber}</span>
              </div>
              {merchantCode && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Code marchand / USSD</span>
                  <span className="font-mono font-bold text-[#D4AF37]">{merchantCode}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Nom du compte marchand</span>
                <span>{merchantName}</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#000000] p-4 text-xs text-slate-300 space-y-1.5 leading-relaxed">
              <p className="font-semibold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#0066FF]" />
                Instructions {paymentMethod === 'moncash' ? 'MonCash' : 'NatCash'} :
              </p>
              <p>1. Ouvrez votre application {paymentMethod === 'moncash' ? 'MonCash' : 'NatCash'} et envoyez le montant exact vers <strong>{merchantNumber}</strong>.</p>
              <p>2. Copiez l’identifiant/référence de transaction reçu par SMS.</p>
              <p>3. Saisissez cette référence ci-dessous. Une capture d’écran seule n’est jamais acceptée.</p>
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
                placeholder="Ex: MC9482710394"
                className="w-full rounded-xl border border-white/10 bg-[#000000] px-3.5 py-3 text-sm font-mono uppercase text-white focus:border-[#0066FF] focus:outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#D4AF37] py-3.5 text-sm font-bold text-[#000000] hover:bg-[#F5C451] transition-colors cursor-pointer"
            >
              {loading ? '...' : 'Soumettre pour vérification sécurisée'}
            </button>
          </form>
        ) : (
          <div className="mt-6 text-center space-y-4 py-4">
            <CheckCircle2 className="w-12 h-12 text-[#0066FF] mx-auto" />
            <h3 className="font-display text-xl font-bold text-white">
              Paiement en vérification ({createdOrder.orderRef})
            </h3>
            <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
              Votre référence <span className="font-mono text-[#D4AF37]">{transactionRef.toUpperCase()}</span> est enregistrée.
              Dès validation, la commande sera envoyée au fournisseur ou livrée manuellement par notre équipe.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Suivi disponible en direct dans votre compte client.</span>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl bg-[#0066FF] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#0052CC] cursor-pointer"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
