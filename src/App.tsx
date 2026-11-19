import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  ArrowRight,
  Gamepad2,
  Globe,
  HelpCircle,
  Home,
  LogOut,
  MessageCircle,
  Package,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  User,
} from 'lucide-react';
import { auth } from './lib/firebase.ts';
import { BrandLogo } from './components/BrandLogo.tsx';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstall.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { ProductCheckoutModal } from './components/ProductCheckoutModal.tsx';
import { DlsRechargeView } from './components/DlsRechargeView.tsx';
import { AccountPortal } from './components/AccountPortal.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { CashierPortal } from './components/CashierPortal.tsx';
import { formatMoney, getT } from './i18n/translations.ts';
import type {
  CurrencyCode,
  LangCode,
  Product,
  StorefrontData,
  UserProfile,
} from './types.ts';

type ActiveView = 'home' | 'catalog' | 'dls' | 'account' | 'support';
type PortalRoute = '/' | '/admin' | '/caissier';

function resolvePortalRoute(pathname: string): PortalRoute {
  if (pathname.startsWith('/admin')) return '/admin';
  if (pathname.startsWith('/caissier') || pathname.startsWith('/cashier')) return '/caissier';
  return '/';
}

export default function App() {
  const [portalRoute, setPortalRoute] = useState<PortalRoute>(() =>
    resolvePortalRoute(window.location.pathname)
  );
  const [lang, setLang] = useState<LangCode>('fr');
  const [currency, setCurrency] = useState<CurrencyCode>('HTG');
  const [view, setView] = useState<ActiveView>('home');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'gift_card' | 'gaming_topup'>('all');
  const [sectionTab, setSectionTab] = useState<'all' | 'popular' | 'new' | 'promo'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const onPopState = () => {
      setPortalRoute(resolvePortalRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = useCallback((target: PortalRoute) => {
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target);
    }
    setPortalRoute(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const [storefront, setStorefront] = useState<StorefrontData | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeError, setStoreError] = useState('');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [localSessionToken, setLocalSessionToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('ksg_session');
    } catch {
      return null;
    }
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);

  const t = getT(lang);

  const getAuthHeader = useCallback(async (): Promise<string | null> => {
    if (localSessionToken) {
      return `Bearer ${localSessionToken}`;
    }
    const fbUser = auth.currentUser;
    if (fbUser) {
      const token = await fbUser.getIdToken();
      return `Bearer ${token}`;
    }
    return null;
  }, [localSessionToken]);

  const loadStorefront = useCallback(async () => {
    setStoreLoading(true);
    setStoreError('');
    try {
      const resp = await fetch('/api/storefront');
      if (!resp.ok) throw new Error('Erreur de chargement du catalogue');
      const data = (await resp.json()) as StorefrontData;
      setStorefront(data);
    } catch (err: unknown) {
      setStoreError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setStoreLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStorefront();
  }, [loadStorefront]);

  useEffect(() => {
    const syncLocal = async () => {
      if (!localSessionToken) return;
      try {
        const resp = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${localSessionToken}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          setProfile(data.profile);
        } else {
          setLocalSessionToken(null);
          sessionStorage.removeItem('ksg_session');
        }
      } catch {
        // Keep silent if offline
      }
    };
    syncLocal();

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !localSessionToken) {
        try {
          const idToken = await fbUser.getIdToken();
          const resp = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (resp.ok) {
            const data = await resp.json();
            setProfile(data.profile);
          }
        } catch {
          // Ignore transient error
        }
      }
    });
    return () => unsub();
  }, [localSessionToken]);

  const handleAuthenticated = (newProfile: UserProfile, token?: string) => {
    setProfile(newProfile);
    if (token) {
      setLocalSessionToken(token);
      try {
        sessionStorage.setItem('ksg_session', token);
      } catch {
        // Ignore
      }
    }
  };

  const handleLogout = async () => {
    setProfile(null);
    setLocalSessionToken(null);
    try {
      sessionStorage.removeItem('ksg_session');
    } catch {
      // Ignore
    }
    if (auth.currentUser) {
      await signOut(auth);
    }
    if (view === 'account' || view === 'support') {
      setView('home');
    }
  };

  const isStaff = Boolean(
    profile &&
      (profile.permissions.includes('*') ||
        profile.permissions.includes('orders:read_all') ||
        profile.permissions.includes('products:manage'))
  );

  const isCashier = Boolean(
    profile &&
      (profile.permissions.includes('*') ||
        profile.permissions.includes('cashier:pos') ||
        profile.permissions.includes('payments:verify'))
  );

  const exchangeRate = storefront?.exchangeRate ?? 132.5;
  const products = storefront?.products ?? [];
  const dlsProduct = products.find((p) => p.productType === 'dls_topup' || p.slug === 'dream-league-soccer');

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter === 'gift_card' && p.productType !== 'gift_card') return false;
      if (categoryFilter === 'gaming_topup' && p.productType === 'gift_card') return false;
      if (sectionTab === 'popular' && !p.isPopular) return false;
      if (sectionTab === 'new' && !p.isNew) return false;
      if (sectionTab === 'promo' && !p.isPromo) return false;
      if (q) {
        const hay = `${p.name} ${p.brand} ${p.compatibleRegions} ${p.descriptionFr} ${p.descriptionEn}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, categoryFilter, sectionTab, searchQuery]);

  const whatsappUrl = storefront
    ? `https://wa.me/${storefront.merchantConfig.whatsappNumber.replace(/[^\d]/g, '')}`
    : 'https://wa.me/50937000000';

  const getProductDescription = (p: Product) =>
    lang === 'es' ? p.descriptionEs : lang === 'en' ? p.descriptionEn : p.descriptionFr;

  // SEPARATE STANDALONE ADMIN PORTAL (/admin)
  if (portalRoute === '/admin') {
    return (
      <>
        <AdminDashboard
          profile={profile}
          products={products}
          categories={storefront?.categories || []}
          exchangeRate={exchangeRate}
          merchantConfig={
            storefront?.merchantConfig || {
              moncashNumber: '+509 3700-0000',
              moncashName: 'KAL-SU GIFT',
              moncashFeePercent: 0,
              natcashNumber: '+509 3200-0000',
              natcashName: 'KAL-SU GIFT',
              natcashFeePercent: 0,
              whatsappNumber: '+50937000000',
              supportEmail: 'support@kalsugift.ht',
              moncashAutoApiEnabled: false,
              natcashAutoApiEnabled: false,
            }
          }
          getAuthHeader={getAuthHeader}
          onRefreshStorefront={loadStorefront}
          onNavigate={navigateTo}
          onRequireAuth={() => {
            setAuthModalMode('login');
            setAuthModalOpen(true);
          }}
          onLogout={handleLogout}
        />
        <AuthModal
          isOpen={authModalOpen}
          initialMode={authModalMode}
          lang={lang}
          currency={currency}
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={handleAuthenticated}
        />
      </>
    );
  }

  // SEPARATE STANDALONE CASHIER PORTAL (/caissier)
  if (portalRoute === '/caissier') {
    return (
      <>
        <CashierPortal
          profile={profile}
          products={products}
          exchangeRate={exchangeRate}
          merchantConfig={
            storefront?.merchantConfig || {
              moncashNumber: '+509 3700-0000',
              moncashName: 'KAL-SU GIFT',
              moncashFeePercent: 0,
              natcashNumber: '+509 3200-0000',
              natcashName: 'KAL-SU GIFT',
              natcashFeePercent: 0,
              whatsappNumber: '+50937000000',
              supportEmail: 'support@kalsugift.ht',
              moncashAutoApiEnabled: false,
              natcashAutoApiEnabled: false,
            }
          }
          getAuthHeader={getAuthHeader}
          onRequireAuth={() => {
            setAuthModalMode('login');
            setAuthModalOpen(true);
          }}
          onNavigate={navigateTo}
          onLogout={handleLogout}
          isAdminUser={isStaff}
        />
        <AuthModal
          isOpen={authModalOpen}
          initialMode={authModalMode}
          lang={lang}
          currency={currency}
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={handleAuthenticated}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#F8FAFC] flex flex-col pb-20 md:pb-0">
      {/* Slim Top Header — Clean 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-[#0066FF]/35 bg-black/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          <button
            onClick={() => setView('home')}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] rounded-lg cursor-pointer"
          >
            <BrandLogo size="sm" />
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <button
              onClick={() => setView('catalog')}
              className={`whitespace-nowrap shrink-0 hover:text-white transition-colors cursor-pointer ${
                view === 'catalog' || view === 'home' ? 'text-white' : ''
              }`}
            >
              {t.navCatalog}
            </button>
            <button
              onClick={() => setView('dls')}
              className={`whitespace-nowrap shrink-0 hover:text-white transition-colors cursor-pointer ${
                view === 'dls' ? 'text-[#D4AF37]' : ''
              }`}
            >
              {t.navGaming}
            </button>
            <button
              onClick={() => {
                if (!profile) {
                  setAuthModalMode('login');
                  setAuthModalOpen(true);
                } else {
                  setView('account');
                }
              }}
              className={`whitespace-nowrap shrink-0 hover:text-white transition-colors cursor-pointer ${
                view === 'account' ? 'text-white' : ''
              }`}
            >
              {t.navTracking}
            </button>
            <button
              onClick={() => {
                if (!profile) {
                  setAuthModalMode('login');
                  setAuthModalOpen(true);
                } else {
                  setView('support');
                }
              }}
              className={`whitespace-nowrap shrink-0 hover:text-white transition-colors cursor-pointer ${
                view === 'support' ? 'text-white' : ''
              }`}
            >
              {t.navSupport}
            </button>
            {isCashier && (
              <button
                onClick={() => navigateTo('/caissier')}
                className="whitespace-nowrap shrink-0 text-[#3B9EFF] hover:text-white font-semibold transition-colors cursor-pointer"
              >
                Caissier
              </button>
            )}
            {isStaff && (
              <button
                onClick={() => navigateTo('/admin')}
                className="whitespace-nowrap shrink-0 text-[#D4AF37] hover:text-[#F2CE5B] font-semibold transition-colors cursor-pointer"
              >
                {t.navAdmin}
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton lang={lang} />
            {profile ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setView('account')}
                  className="electric-glow-btn inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span className="max-w-[120px] truncate">{profile.fullName}</span>
                </button>
                <button
                  onClick={handleLogout}
                  title={t.logout}
                  aria-label={t.logout}
                  className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAuthModalMode('login');
                  setAuthModalOpen(true);
                }}
                className="electric-glow-btn rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.login}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Secondary Storefront Toolbar */}
      <div className="border-b border-white/10 bg-[#04060D]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#0066FF] absolute left-3 top-2.5" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (view !== 'home' && view !== 'catalog') setView('catalog');
                }}
                placeholder={t.searchPlaceholder}
                className="w-full rounded-lg border border-[#0066FF]/35 bg-black pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-[#0066FF] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden lg:inline font-mono text-xs text-slate-400">
              {t.rateLabel}: <span className="text-[#D4AF37] font-semibold">1 USD = {exchangeRate.toFixed(2)} HTG</span>
            </span>

            <div className="flex items-center rounded-lg bg-black p-0.5 border border-[#D4AF37]/45">
              {(['HTG', 'USD'] as CurrencyCode[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    currency === c ? 'solid-gold-btn' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex items-center rounded-lg bg-black p-0.5 border border-[#0066FF]/40">
              {(['fr', 'es', 'en'] as LangCode[]).map((code) => (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className={`rounded-md px-2 py-1 text-xs font-semibold uppercase transition-colors cursor-pointer ${
                    lang === code ? 'bg-[#0066FF] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>

            {!profile && (
              <button
                onClick={() => {
                  setAuthModalMode('register');
                  setAuthModalOpen(true);
                }}
                className="text-xs font-semibold text-[#D4AF37] hover:underline whitespace-nowrap cursor-pointer"
              >
                {t.register}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Dynamic Viewport */}
      <main className="flex-1">
        {view === 'dls' && storefront && (
          <DlsRechargeView
            dlsProduct={dlsProduct}
            dlsCompatibility={storefront.dlsCompatibility}
            lang={lang}
            currency={currency}
            exchangeRate={exchangeRate}
            merchantConfig={storefront.merchantConfig}
            profile={profile}
            getAuthHeader={getAuthHeader}
            onRequireAuth={() => {
              setAuthModalMode('login');
              setAuthModalOpen(true);
            }}
            onOrderCreated={() => setView('account')}
          />
        )}

        {(view === 'account' || view === 'support') && profile && storefront && (
          <AccountPortal
            profile={profile}
            lang={lang}
            currency={currency}
            merchantConfig={storefront.merchantConfig}
            getAuthHeader={getAuthHeader}
            onProfileUpdated={setProfile}
            initialTab={view === 'support' ? 'support' : 'orders'}
          />
        )}

        {(view === 'home' || view === 'catalog') && (
          <div className="space-y-14 pb-16">
            {view === 'home' && (
              <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 sm:pt-10">
                <div className="relative overflow-hidden rounded-2xl border border-[#0066FF]/25 bg-[#060912] shadow-[0_0_50px_rgba(37,99,235,0.12)] grid lg:grid-cols-12 items-stretch">
                  <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-center">
                    <div className="text-xs font-semibold tracking-[0.18em] gold-shimmer-text uppercase">
                      {t.slogan}
                    </div>
                    <h1 className="mt-3 font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-[1.12] text-balance">
                      {t.heroTitle}
                    </h1>
                    <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                      {t.heroSubtitle}
                    </p>
                    <div className="mt-7 flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => setView('catalog')}
                        className="electric-glow-btn inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-colors cursor-pointer"
                      >
                        <span>{t.heroCtaPrimary}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setView('dls')}
                        className="gold-shimmer-btn inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-colors cursor-pointer"
                      >
                        <Trophy className="w-4 h-4" />
                        <span>{t.heroCtaDls}</span>
                      </button>
                    </div>
                  </div>
                  <div className="lg:col-span-5 relative min-h-[240px] lg:min-h-[380px]">
                    <img
                      src="/src/assets/images/hero_kalsu_gift_1795058562199.jpg"
                      alt="KAL-SU GIFT digital gift cards showcase"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#060912] via-transparent to-transparent" />
                  </div>
                </div>

                <div className="mt-6 grid md:grid-cols-2 gap-6">
                  <button
                    onClick={() => {
                      setCategoryFilter('gift_card');
                      setView('catalog');
                    }}
                    className="group relative overflow-hidden rounded-2xl border border-[#0066FF]/25 bg-[#060912] text-left grid sm:grid-cols-12 items-stretch hover:border-[#3B82F6] transition-colors cursor-pointer"
                  >
                    <div className="sm:col-span-7 p-6 flex flex-col justify-center">
                      <div className="text-xs text-[#60A5FA] font-medium">Google Play · Apple · Amazon · Steam · PSN</div>
                      <h2 className="mt-1.5 font-display text-xl font-bold text-white">{t.catGiftCards}</h2>
                      <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                        {storefront?.categories[0]?.descriptionFr ||
                          'Codes numériques vérifiés par région avec livraison rapide.'}
                      </p>
                    </div>
                    <div className="sm:col-span-5 min-h-[140px]">
                      <img
                        src="/src/assets/images/cat_gift_cards_1795058562137.jpg"
                        alt={t.catGiftCards}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    </div>
                  </button>

                  <button
                    onClick={() => setView('dls')}
                    className="group relative overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-[#060912] text-left grid sm:grid-cols-12 items-stretch hover:border-[#D4AF37] transition-colors cursor-pointer"
                  >
                    <div className="sm:col-span-7 p-6 flex flex-col justify-center">
                      <div className="text-xs text-[#D4AF37] font-medium">DLS · Free Fire · PUBG · FC Mobile · CODM</div>
                      <h2 className="mt-1.5 font-display text-xl font-bold text-white">{t.catGaming}</h2>
                      <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                        {storefront?.categories[1]?.descriptionFr ||
                          'Recharge directe par Player ID sans mot de passe.'}
                      </p>
                    </div>
                    <div className="sm:col-span-5 min-h-[140px]">
                      <img
                        src="/src/assets/images/cat_gaming_topup_1795058562435.jpg"
                        alt={t.catGaming}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    </div>
                  </button>
                </div>
              </section>
            )}

            {/* Catalog Section */}
            <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-4 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">
                    {sectionTab === 'popular'
                      ? t.popularTitle
                      : sectionTab === 'new'
                      ? t.newTitle
                      : sectionTab === 'promo'
                      ? t.promoTitle
                      : t.navCatalog}
                  </h2>
                  {products.some((p) => p.isDemo) && (
                    <p className="mt-1 text-xs text-slate-400">{t.demoNotice}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center rounded-xl bg-[#060912] p-1 border border-[#0066FF]/25">
                    {(
                      [
                        { id: 'all', label: t.catAll },
                        { id: 'gift_card', label: t.catGiftCards },
                        { id: 'gaming_topup', label: t.catGaming },
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setCategoryFilter(cat.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          categoryFilter === cat.id
                            ? 'bg-[#0066FF] text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center rounded-xl bg-[#060912] p-1 border border-[#D4AF37]/25">
                    {(
                      [
                        { id: 'all', label: 'Tous' },
                        { id: 'popular', label: 'Populaires' },
                        { id: 'new', label: 'Nouveautés' },
                        { id: 'promo', label: 'Promos' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setSectionTab(st.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          sectionTab === st.id
                            ? 'gold-shimmer-btn font-semibold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {storeLoading ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div
                      key={n}
                      className="h-80 rounded-2xl border border-white/10 bg-[#060912] animate-pulse"
                    />
                  ))}
                </div>
              ) : storeError ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
                  {storeError}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[#060912] p-10 text-center text-sm text-slate-400">
                  Aucun produit ne correspond à votre recherche.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProducts.map((product) => {
                    const lowestVariant = product.variants[0];
                    const lowestUsd = lowestVariant
                      ? Number(lowestVariant.promoPriceUsd || lowestVariant.sellingPriceUsd)
                      : 0;
                    const fallbackBg = product.accentHex || '#0066FF';

                    return (
                      <article
                        key={product.id}
                        className="group rounded-2xl border border-[#0066FF]/20 bg-[#060912] overflow-hidden flex flex-col hover:-translate-y-0.5 hover:border-[#D4AF37]/50 transition-all duration-200"
                      >
                        <div className="relative h-44 bg-[#050811] overflow-hidden">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                            />
                          ) : (
                            <div
                              className="h-full w-full flex items-center justify-center"
                              style={{ background: `linear-gradient(135deg, ${fallbackBg}33, #000000)` }}
                            >
                              <Sparkles className="w-8 h-8 text-[#D4AF37]" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-[#060912] via-transparent to-transparent" />
                          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs">
                            <span className="font-semibold text-white">{product.brand}</span>
                            {product.isDemo && (
                              <span className="text-[11px] text-slate-300">Démo</span>
                            )}
                          </div>
                        </div>

                        <div className="p-5 flex-1 flex flex-col">
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="text-[#D4AF37]">{product.compatibleRegions}</span>
                            <span aria-hidden="true">·</span>
                            <span>{product.deliveryTimeLabel}</span>
                          </div>

                          <h3 className="mt-1.5 font-display text-lg font-semibold text-white">
                            {product.name}
                          </h3>

                          <p className="mt-1.5 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {getProductDescription(product)}
                          </p>

                          <div className="mt-4 pt-4 border-t border-white/10 flex items-end justify-between gap-3 mt-auto">
                            <div>
                              <div className="text-[11px] text-slate-400">
                                {lowestVariant ? lowestVariant.label : '—'}
                              </div>
                              <div className="font-mono text-base font-bold text-[#D4AF37]">
                                {formatMoney(lowestUsd, currency, exchangeRate)}
                              </div>
                              <div className="font-mono text-[11px] text-slate-400">
                                {currency === 'HTG'
                                  ? `$${lowestUsd.toFixed(2)} USD`
                                  : `${(lowestUsd * exchangeRate).toFixed(0)} HTG`}
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                if (product.productType === 'dls_topup') {
                                  setView('dls');
                                } else {
                                  setCheckoutProduct(product);
                                }
                              }}
                              className="electric-glow-btn rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {t.buyNow}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Trust & Security Section */}
            <section className="mx-auto max-w-7xl px-4 sm:px-6">
              <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#060912] p-6 sm:p-10 space-y-6">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 text-xs font-semibold gold-shimmer-text">
                    <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                    <span>KAL-SU GIFT</span>
                  </div>
                  <h2 className="mt-2 font-display text-2xl font-bold text-white text-balance">
                    {t.trustTitle}
                  </h2>
                  <p className="mt-2 text-sm text-slate-300 leading-relaxed">{t.trustSubtitle}</p>
                </div>

                <div className="grid md:grid-cols-3 gap-6 pt-2">
                  {t.trustItems.map((item) => (
                    <div key={item.title} className="border-t border-white/10 pt-4">
                      <h3 className="font-semibold text-white text-sm">{item.title}</h3>
                      <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={t.whatsappCta}
        className="hidden md:inline-flex fixed bottom-6 right-6 z-40 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-semibold text-white shadow-xl hover:bg-emerald-500 transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        <span>{t.whatsappCta}</span>
      </a>

      <footer className="border-t border-[#0066FF]/30 bg-black py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <BrandLogo showSlogan size="sm" />
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400">
            <button onClick={() => setView('catalog')} className="hover:text-white cursor-pointer">
              {t.navCatalog}
            </button>
            <button onClick={() => setView('dls')} className="hover:text-white cursor-pointer">
              Dream League Soccer
            </button>
            <button onClick={() => navigateTo('/caissier')} className="text-[#3B9EFF] hover:text-white cursor-pointer">
              Espace Caissier
            </button>
            <button onClick={() => navigateTo('/admin')} className="text-[#D4AF37] hover:text-white cursor-pointer">
              Espace Admin
            </button>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="hover:text-white">
              WhatsApp
            </a>
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#0066FF]" />
              MonCash · NatCash · USD · HTG
            </span>
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} KAL-SU GIFT. {t.footerRights}</p>
        </div>
      </footer>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#0066FF]/35 bg-black/95 backdrop-blur-md pb-safe">
        <div className="grid grid-cols-5 h-16 items-center">
          <button
            onClick={() => setView('home')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              view === 'home' || view === 'catalog' ? 'text-[#0066FF]' : 'text-slate-400'
            }`}
          >
            <Home className="w-5 h-5" />
            <span>{t.navCatalog}</span>
          </button>
          <button
            onClick={() => setView('dls')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              view === 'dls' ? 'text-[#D4AF37]' : 'text-slate-400'
            }`}
          >
            <Gamepad2 className="w-5 h-5" />
            <span>DLS</span>
          </button>
          <button
            onClick={() => {
              if (!profile) {
                setAuthModalMode('login');
                setAuthModalOpen(true);
              } else {
                setView('account');
              }
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              view === 'account' ? 'text-[#0066FF]' : 'text-slate-400'
            }`}
          >
            <Package className="w-5 h-5" />
            <span>{t.navTracking}</span>
          </button>
          <button
            onClick={() => {
              if (!profile) {
                setAuthModalMode('login');
                setAuthModalOpen(true);
              } else {
                setView('support');
              }
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              view === 'support' ? 'text-[#0066FF]' : 'text-slate-400'
            }`}
          >
            <HelpCircle className="w-5 h-5" />
            <span>{t.navSupport}</span>
          </button>
          <button
            onClick={() => {
              if (!profile) {
                setAuthModalMode('login');
                setAuthModalOpen(true);
              } else if (isStaff) {
                navigateTo('/admin');
              } else if (isCashier) {
                navigateTo('/caissier');
              } else {
                setView('account');
              }
            }}
            className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-[#D4AF37]"
          >
            <User className="w-5 h-5" />
            <span>{isStaff ? 'Admin' : isCashier ? 'Caisse' : t.myAccount}</span>
          </button>
        </div>
      </nav>

      <OfflineIndicator lang={lang} />

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        lang={lang}
        currency={currency}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />

      {storefront && (
        <ProductCheckoutModal
          product={checkoutProduct}
          lang={lang}
          currency={currency}
          exchangeRate={exchangeRate}
          merchantConfig={storefront.merchantConfig}
          profile={profile}
          getAuthHeader={getAuthHeader}
          onRequireAuth={() => {
            setAuthModalMode('login');
            setAuthModalOpen(true);
          }}
          onClose={() => setCheckoutProduct(null)}
          onOrderCompleted={() => {
            setCheckoutProduct(null);
            setView('account');
          }}
        />
      )}
    </div>
  );
}
