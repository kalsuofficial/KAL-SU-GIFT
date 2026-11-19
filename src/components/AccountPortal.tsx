import React, { useEffect, useState } from 'react';
import { Bell, HelpCircle, Package, CreditCard, User, MessageSquare, Check } from 'lucide-react';
import { getT } from '../i18n/translations.ts';
import type { CurrencyCode, LangCode, MerchantConfig, OrderRecord, UserProfile } from '../types.ts';

interface AccountPortalProps {
  profile: UserProfile;
  lang: LangCode;
  currency: CurrencyCode;
  merchantConfig: MerchantConfig;
  getAuthHeader: () => Promise<string | null>;
  onProfileUpdated: (p: UserProfile) => void;
  initialTab?: 'orders' | 'payments' | 'notifications' | 'support' | 'profile';
}

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  channel: string;
  isRead: boolean;
  createdAt: string;
}

interface TicketItem {
  id: number;
  ticketRef: string;
  subject: string;
  category: string;
  message: string;
  status: string;
  adminReply: string | null;
  createdAt: string;
}

export const AccountPortal: React.FC<AccountPortalProps> = ({
  profile,
  lang,
  merchantConfig,
  getAuthHeader,
  onProfileUpdated,
  initialTab = 'orders',
}) => {
  const t = getT(lang);
  const [tab, setTab] = useState(initialTab);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment ref submission for pending orders
  const [payingOrderRef, setPayingOrderRef] = useState<string | null>(null);
  const [txRefInput, setTxRefInput] = useState('');
  const [payMethod, setPayMethod] = useState<'moncash' | 'natcash'>('moncash');

  // Refund modal inline
  const [refundOrderRef, setRefundOrderRef] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');

  // Profile form
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone || '');
  const [statusMessage, setStatusMessage] = useState('');

  // Support form
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');

  const loadAccountData = async () => {
    setLoading(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;
      const [ordRes, notifRes, tktRes] = await Promise.all([
        fetch('/api/orders/mine', { headers: { Authorization: authHeader } }),
        fetch('/api/notifications', { headers: { Authorization: authHeader } }),
        fetch('/api/tickets', { headers: { Authorization: authHeader } }),
      ]);
      const [ordJson, notifJson, tktJson] = await Promise.all([
        ordRes.json(),
        notifRes.json(),
        tktRes.json(),
      ]);
      setOrders(ordJson.orders || []);
      setNotifications(notifJson.notifications || []);
      setTickets(tktJson.tickets || []);
    } catch (err) {
      console.error('Account load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccountData();
  }, []);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const handlePayPending = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingOrderRef) return;
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch(`/api/orders/${payingOrderRef}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ method: payMethod, transactionRef: txRefInput }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setStatusMessage(data.error || 'Erreur soumission paiement');
      return;
    }
    setPayingOrderRef(null);
    setTxRefInput('');
    setStatusMessage('Référence soumise pour vérification.');
    loadAccountData();
  };

  const handleRequestRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundOrderRef) return;
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch(`/api/orders/${refundOrderRef}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ reason: refundReason }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setStatusMessage(data.error || 'Erreur demande remboursement');
      return;
    }
    setRefundOrderRef(null);
    setRefundReason('');
    setStatusMessage('Demande de remboursement enregistrée.');
    loadAccountData();
  };

  const handleMarkNotifRead = async (id: number) => {
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    await fetch(`/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: authHeader },
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ fullName, phone }),
    });
    const data = await resp.json();
    if (resp.ok && data.profile) {
      onProfileUpdated(data.profile);
      setStatusMessage('Profil mis à jour.');
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const authHeader = await getAuthHeader();
    if (!authHeader) return;
    const resp = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ subject, category, message }),
    });
    if (resp.ok) {
      setSubject('');
      setMessage('');
      setStatusMessage('Ticket de support envoyé.');
      loadAccountData();
    }
  };

  const allPayments = orders.flatMap((o) =>
    (o.payments || []).map((p) => ({ ...p, orderRef: o.orderRef }))
  );

  const tabs = [
    { id: 'orders' as const, label: 'Commandes & Suivi', icon: Package },
    { id: 'payments' as const, label: 'Paiements', icon: CreditCard },
    { id: 'notifications' as const, label: `Notifications (${notifications.filter((n) => !n.isRead).length})`, icon: Bell },
    { id: 'support' as const, label: 'Assistance & FAQ', icon: HelpCircle },
    { id: 'profile' as const, label: 'Profil & Fidélité', icon: User },
  ];

  const faqs = [
    {
      q: 'Comment fonctionne la vérification MonCash & NatCash ?',
      a: 'Après avoir envoyé le montant exact au numéro marchand officiel affiché, vous saisissez la référence de transaction SMS. L’API officielle (si activée) ou notre équipe valide la transaction avant livraison. Aucune capture d’écran seule n’est acceptée.',
    },
    {
      q: 'Est-ce sûr pour mon compte Dream League Soccer (DLS) ?',
      a: 'Oui. KAL-SU GIFT utilise uniquement votre Player ID pour recharger votre compte DLS et ne demande jamais votre mot de passe.',
    },
    {
      q: 'Pourquoi vérifier la région d’une carte cadeau ?',
      a: 'Une carte Google Play ou Apple USA ne peut être activée que sur un compte configuré aux États-Unis. Nous indiquons toujours les restrictions avant l’achat.',
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">{profile.fullName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{profile.email}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[#D4AF37]">{profile.loyaltyPoints} pts fidélité</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 rounded-xl bg-[#060912] p-1 border border-white/10">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  tab === item.id
                    ? 'bg-[#0066FF] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-xs text-blue-200 flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage('')} className="text-slate-400 hover:text-white cursor-pointer">
            OK
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Chargement...</div>
      ) : (
        <>
          {tab === 'orders' && (
            <div className="space-y-4">
              {orders.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[#060912] p-8 text-center text-sm text-slate-400">
                  Vous n’avez pas encore passé de commande.
                </div>
              ) : (
                orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="rounded-2xl border border-white/10 bg-[#060912] p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="font-mono font-semibold text-white">{ord.orderRef}</span>
                          <span aria-hidden="true">·</span>
                          <span>{new Date(ord.createdAt).toLocaleString('fr-FR')}</span>
                          <span aria-hidden="true">·</span>
                          <span className="uppercase">{ord.paymentMethod}</span>
                        </div>
                        <h3 className="mt-1 font-semibold text-white text-sm">
                          {ord.items.map((i) => `${i.productName} (${i.variantLabel}) × ${i.quantity}`).join(', ')}
                        </h3>
                        {ord.playerId && (
                          <p className="mt-1 text-xs text-blue-300 font-mono">
                            Player ID : {ord.playerId}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-base font-bold text-[#D4AF37]">
                          {ord.currency === 'HTG'
                            ? `${Number(ord.totalHtg).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG`
                            : `$${Number(ord.totalUsd).toFixed(2)} USD`}
                        </div>
                        <div className="mt-0.5 text-xs font-medium text-blue-300">
                          {t.orderStatuses[ord.status] || ord.status}
                        </div>
                      </div>
                    </div>

                    {ord.deliveryPayload?.codeOrReceipt && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs space-y-1">
                        <div className="font-semibold text-emerald-300">Livraison effectuée :</div>
                        <div className="font-mono text-sm text-white select-all">
                          {ord.deliveryPayload.codeOrReceipt}
                        </div>
                        {ord.deliveryPayload.notes && (
                          <div className="text-slate-300">{ord.deliveryPayload.notes}</div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                      <span>Taux appliqué : 1 USD = {Number(ord.exchangeRateUsed).toFixed(2)} HTG</span>
                      <div className="flex items-center gap-2">
                        {ord.status === 'pending_payment' && (
                          <button
                            onClick={() => {
                              setPayingOrderRef(ord.orderRef);
                              setPayMethod(ord.paymentMethod === 'natcash' ? 'natcash' : 'moncash');
                            }}
                            className="rounded-lg bg-[#D4AF37] px-3 py-1.5 font-semibold text-[#000000] hover:bg-[#F5C451] cursor-pointer"
                          >
                            Saisir référence de paiement
                          </button>
                        )}
                        {ord.status !== 'refunded' && ord.status !== 'pending_payment' && (
                          <button
                            onClick={() => setRefundOrderRef(ord.orderRef)}
                            className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-300 hover:text-white cursor-pointer"
                          >
                            Demander remboursement
                          </button>
                        )}
                      </div>
                    </div>

                    {payingOrderRef === ord.orderRef && (
                      <form onSubmit={handlePayPending} className="rounded-xl border border-white/10 bg-[#000000] p-4 flex flex-wrap gap-2">
                        <input
                          type="text"
                          required
                          value={txRefInput}
                          onChange={(e) => setTxRefInput(e.target.value)}
                          placeholder="Référence transaction MonCash/NatCash"
                          className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-[#060912] px-3 py-2 text-xs font-mono text-white"
                        />
                        <button type="submit" className="rounded-lg bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white cursor-pointer">
                          Envoyer
                        </button>
                      </form>
                    )}

                    {refundOrderRef === ord.orderRef && (
                      <form onSubmit={handleRequestRefund} className="rounded-xl border border-white/10 bg-[#000000] p-4 flex flex-wrap gap-2">
                        <input
                          type="text"
                          required
                          minLength={5}
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          placeholder="Motif de la demande de remboursement"
                          className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-[#060912] px-3 py-2 text-xs text-white"
                        />
                        <button type="submit" className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-[#000000] cursor-pointer">
                          Soumettre
                        </button>
                      </form>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'payments' && (
            <div className="rounded-2xl border border-white/10 bg-[#060912] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 text-slate-400">
                  <tr>
                    <th className="p-4 font-medium">Commande</th>
                    <th className="p-4 font-medium">Méthode</th>
                    <th className="p-4 font-medium">Référence TX</th>
                    <th className="p-4 font-medium text-right">Montant</th>
                    <th className="p-4 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {allPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        Aucun paiement enregistré.
                      </td>
                    </tr>
                  ) : (
                    allPayments.map((pm) => (
                      <tr key={pm.id} className="hover:bg-white/[0.02]">
                        <td className="p-4 font-mono text-white">{pm.orderRef}</td>
                        <td className="p-4 uppercase text-slate-300">{pm.method}</td>
                        <td className="p-4 font-mono text-[#D4AF37]">{pm.transactionRef}</td>
                        <td className="p-4 text-right font-mono text-white">
                          {pm.amount} {pm.currency}
                        </td>
                        <td className="p-4 text-slate-300">{pm.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="space-y-3">
              {notifications.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[#060912] p-6 text-center text-sm text-slate-400">
                  Aucune notification.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-4 flex items-start justify-between gap-4 ${
                      n.isRead ? 'border-white/5 bg-[#060912]/60' : 'border-blue-500/30 bg-[#060912]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="uppercase">{n.channel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(n.createdAt).toLocaleString('fr-FR')}</span>
                      </div>
                      <h4 className="mt-1 font-semibold text-white text-sm">{n.title}</h4>
                      <p className="mt-1 text-xs text-slate-300">{n.message}</p>
                    </div>
                    {!n.isRead && (
                      <button
                        onClick={() => handleMarkNotifRead(n.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-slate-300 hover:text-white shrink-0 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Lu
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'support' && (
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 space-y-5">
                <form onSubmit={handleCreateTicket} className="rounded-2xl border border-white/10 bg-[#060912] p-6 space-y-4">
                  <h3 className="font-display text-lg font-semibold text-white">Ouvrir un ticket / réclamation</h3>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Sujet (ex: Vérification paiement MonCash)"
                    className="w-full rounded-xl border border-white/10 bg-[#000000] px-3.5 py-2.5 text-sm text-white"
                  />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#000000] px-3.5 py-2.5 text-sm text-white"
                  >
                    <option value="payment">Paiement MonCash / NatCash</option>
                    <option value="dls">Recharge Dream League Soccer</option>
                    <option value="delivery">Livraison carte cadeau</option>
                    <option value="refund">Remboursement</option>
                    <option value="general">Assistance générale</option>
                  </select>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Décrivez votre demande avec votre référence commande..."
                    className="w-full rounded-xl border border-white/10 bg-[#000000] px-3.5 py-2.5 text-sm text-white"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-[#0066FF] py-3 text-sm font-semibold text-white hover:bg-[#0052CC] cursor-pointer"
                  >
                    Envoyer le ticket
                  </button>
                </form>

                <div className="rounded-2xl border border-white/10 bg-[#060912] p-6 space-y-3">
                  <h3 className="font-display text-base font-semibold text-white">Contact direct</h3>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={`https://wa.me/${merchantConfig.whatsappNumber.replace(/[^\d]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      <MessageSquare className="w-4 h-4" />
                      WhatsApp ({merchantConfig.whatsappNumber})
                    </a>
                    <a
                      href={`mailto:${merchantConfig.supportEmail}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/10"
                    >
                      {merchantConfig.supportEmail}
                    </a>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-[#060912] p-6 space-y-3">
                  <h3 className="font-display text-lg font-semibold text-white">Vos réclamations</h3>
                  {tickets.length === 0 ? (
                    <p className="text-xs text-slate-400">Aucun ticket ouvert.</p>
                  ) : (
                    tickets.map((tk) => (
                      <div key={tk.id} className="rounded-xl border border-white/10 bg-[#000000] p-4 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="font-mono text-[#D4AF37]">{tk.ticketRef}</span>
                          <span className="uppercase text-blue-300">{tk.status}</span>
                        </div>
                        <div className="font-semibold text-white">{tk.subject}</div>
                        <p className="text-slate-300">{tk.message}</p>
                        {tk.adminReply && (
                          <div className="mt-2 border-t border-white/10 pt-2 text-emerald-300">
                            Réponse support : {tk.adminReply}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#060912] p-6 space-y-4">
                  <h3 className="font-display text-lg font-semibold text-white">Questions fréquentes (FAQ)</h3>
                  {faqs.map((f) => (
                    <div key={f.q} className="border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
                      <h4 className="text-sm font-semibold text-white">{f.q}</h4>
                      <p className="mt-1 text-xs text-slate-400 leading-relaxed">{f.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'profile' && (
            <form onSubmit={handleUpdateProfile} className="max-w-lg rounded-2xl border border-white/10 bg-[#060912] p-6 space-y-4">
              <h3 className="font-display text-lg font-semibold text-white">Informations du compte</h3>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-300">Nom complet</span>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#000000] px-3.5 py-2.5 text-sm text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-300">Téléphone</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#000000] px-3.5 py-2.5 text-sm text-white"
                />
              </label>
              <div className="rounded-xl border border-white/10 bg-[#000000] p-4 flex items-center justify-between text-xs">
                <span className="text-slate-400">Programme fidélité KAL-SU GIFT</span>
                <span className="font-mono font-bold text-[#D4AF37]">{profile.loyaltyPoints} points</span>
              </div>
              <button
                type="submit"
                className="rounded-xl bg-[#0066FF] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#0052CC] cursor-pointer"
              >
                Enregistrer
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
};
