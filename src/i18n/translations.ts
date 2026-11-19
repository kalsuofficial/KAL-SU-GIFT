import type { CurrencyCode, LangCode } from '../types.ts';

export function formatMoney(usdAmount: number | string, currency: CurrencyCode, exchangeRate: number): string {
  const num = Number(usdAmount);
  if (!Number.isFinite(num)) return currency === 'HTG' ? '0.00 HTG' : '$0.00 USD';
  if (currency === 'HTG') {
    const htg = num * exchangeRate;
    return `${htg.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HTG`;
  }
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

export const TRANSLATIONS = {
  fr: {
    slogan: 'YOUR DIGITAL WORLD, ONE PLACE.',
    navCatalog: 'Catalogue',
    navGaming: 'Gaming & DLS',
    navTracking: 'Suivi',
    navSupport: 'Assistance',
    navAdmin: 'Admin',
    login: 'Connexion',
    register: 'Inscription',
    myAccount: 'Mon Compte',
    logout: 'Déconnexion',
    searchPlaceholder: 'Rechercher Google Play, DLS, Free Fire, Steam...',
    heroTitle: 'Cartes cadeaux et recharges numériques fiables pour Haïti',
    heroSubtitle:
      'Payez en Gourdes (HTG) ou en Dollars (USD) via MonCash et NatCash. Livraison rapide par fournisseur API ou vérification sécurisée.',
    heroCtaPrimary: 'Explorer le catalogue',
    heroCtaDls: 'Recharger DLS',
    rateLabel: 'Taux actif',
    demoNotice: 'Catalogue initial de démonstration — Connectez vos fournisseurs API dans l’espace Admin pour la synchronisation temps réel.',
    catAll: 'Tout afficher',
    catGiftCards: 'Cartes Cadeaux',
    catGaming: 'Recharges Gaming',
    popularTitle: 'Produits populaires',
    newTitle: 'Nouveautés',
    promoTitle: 'Promotions actives',
    trustTitle: 'Sécurité et transparence de paiement',
    trustSubtitle:
      'Chaque commande est protégée par un identifiant unique, un verrouillage anti-doublon et une vérification stricte des références MonCash & NatCash.',
    trustItems: [
      {
        title: 'Zéro mot de passe demandé',
        desc: 'Pour Dream League Soccer, Free Fire, PUBG et FC Mobile, seul votre Player ID est requis.',
      },
      {
        title: 'Compatibilité régionale vérifiée',
        desc: 'Chaque carte cadeau affiche clairement sa région (USA, Global) et ses conditions avant achat.',
      },
      {
        title: 'MonCash & NatCash en HTG / USD',
        desc: 'Le taux de change utilisé est enregistré sur votre reçu. Aucune capture d’écran seule n’est acceptée.',
      },
    ],
    buyNow: 'Acheter',
    regionLabel: 'Région',
    deliveryLabel: 'Délai',
    availableLabel: 'Disponible',
    manualDeliveryLabel: 'Validation & livraison manuelle sécurisée',
    outOfStock: 'Rupture de stock',
    whatsappCta: 'Support WhatsApp',
    footerRights: 'Tous droits réservés — Haïti & International.',
    orderStatuses: {
      pending_payment: 'En attente de paiement',
      payment_verifying: 'Paiement en vérification',
      paid: 'Payée',
      processing: 'En traitement',
      delivered: 'Livraison réussie',
      failed: 'Échec',
      cancelled: 'Annulée',
      refunded: 'Remboursée',
    } as Record<string, string>,
  },
  es: {
    slogan: 'YOUR DIGITAL WORLD, ONE PLACE.',
    navCatalog: 'Catálogo',
    navGaming: 'Gaming & DLS',
    navTracking: 'Seguimiento',
    navSupport: 'Soporte',
    navAdmin: 'Admin',
    login: 'Iniciar sesión',
    register: 'Registrarse',
    myAccount: 'Mi Cuenta',
    logout: 'Cerrar sesión',
    searchPlaceholder: 'Buscar Google Play, DLS, Free Fire, Steam...',
    heroTitle: 'Tarjetas de regalo y recargas digitales confiables para Haití',
    heroSubtitle:
      'Paga en Gourdes (HTG) o Dólares (USD) vía MonCash y NatCash. Entrega rápida por proveedor API o verificación segura.',
    heroCtaPrimary: 'Explorar catálogo',
    heroCtaDls: 'Recargar DLS',
    rateLabel: 'Tasa activa',
    demoNotice: 'Catálogo inicial de demostración — Conecta tus proveedores API en Admin para sincronización en vivo.',
    catAll: 'Ver todo',
    catGiftCards: 'Tarjetas de Regalo',
    catGaming: 'Recargas Gaming',
    popularTitle: 'Productos populares',
    newTitle: 'Novedades',
    promoTitle: 'Promociones activas',
    trustTitle: 'Seguridad y transparencia en pagos',
    trustSubtitle:
      'Cada pedido está protegido contra duplicados y verificado mediante referencia real de transacción MonCash y NatCash.',
    trustItems: [
      {
        title: 'Nunca pedimos contraseñas',
        desc: 'Para Dream League Soccer, Free Fire, PUBG y FC Mobile solo necesitamos tu Player ID.',
      },
      {
        title: 'Región verificada',
        desc: 'Cada tarjeta muestra claramente su región compatible (USA, Global) y restricciones.',
      },
      {
        title: 'MonCash y NatCash en HTG / USD',
        desc: 'La tasa de cambio exacta queda registrada en cada pedido.',
      },
    ],
    buyNow: 'Comprar',
    regionLabel: 'Región',
    deliveryLabel: 'Entrega',
    availableLabel: 'Disponible',
    manualDeliveryLabel: 'Validación y entrega manual segura',
    outOfStock: 'Agotado',
    whatsappCta: 'Soporte WhatsApp',
    footerRights: 'Todos los derechos reservados — Haití e Internacional.',
    orderStatuses: {
      pending_payment: 'Pendiente de pago',
      payment_verifying: 'Pago en verificación',
      paid: 'Pagado',
      processing: 'En proceso',
      delivered: 'Entrega exitosa',
      failed: 'Fallido',
      cancelled: 'Cancelado',
      refunded: 'Reembolsado',
    } as Record<string, string>,
  },
  en: {
    slogan: 'YOUR DIGITAL WORLD, ONE PLACE.',
    navCatalog: 'Catalog',
    navGaming: 'Gaming & DLS',
    navTracking: 'Orders',
    navSupport: 'Support',
    navAdmin: 'Admin',
    login: 'Sign In',
    register: 'Sign Up',
    myAccount: 'Account',
    logout: 'Sign Out',
    searchPlaceholder: 'Search Google Play, DLS, Free Fire, Steam...',
    heroTitle: 'Trusted digital gift cards and game top-ups for Haiti',
    heroSubtitle:
      'Pay in Haitian Gourdes (HTG) or US Dollars (USD) with MonCash and NatCash. Fast API delivery or verified manual fulfillment.',
    heroCtaPrimary: 'Browse Catalog',
    heroCtaDls: 'Top Up DLS',
    rateLabel: 'Active rate',
    demoNotice: 'Initial demo catalog — Connect live supplier APIs in the Admin console for real-time stock sync.',
    catAll: 'All items',
    catGiftCards: 'Gift Cards',
    catGaming: 'Gaming Top-Ups',
    popularTitle: 'Popular Products',
    newTitle: 'New Arrivals',
    promoTitle: 'Active Promotions',
    trustTitle: 'Payment security and regional transparency',
    trustSubtitle:
      'Every order uses duplicate protection and strict MonCash & NatCash transaction reference verification.',
    trustItems: [
      {
        title: 'Zero password policy',
        desc: 'For Dream League Soccer, Free Fire, PUBG, and FC Mobile, only your Player ID is required.',
      },
      {
        title: 'Verified region compatibility',
        desc: 'Every gift card clearly states its compatible region (USA, Global) and terms before checkout.',
      },
      {
        title: 'MonCash & NatCash in HTG / USD',
        desc: 'The exact exchange rate is locked onto every order receipt. Screenshots alone are never accepted.',
      },
    ],
    buyNow: 'Buy Now',
    regionLabel: 'Region',
    deliveryLabel: 'Delivery',
    availableLabel: 'Available',
    manualDeliveryLabel: 'Verified secure manual delivery',
    outOfStock: 'Out of stock',
    whatsappCta: 'WhatsApp Support',
    footerRights: 'All rights reserved — Haiti & International.',
    orderStatuses: {
      pending_payment: 'Pending Payment',
      payment_verifying: 'Verifying Payment',
      paid: 'Paid',
      processing: 'Processing',
      delivered: 'Delivered',
      failed: 'Failed',
      cancelled: 'Cancelled',
      refunded: 'Refunded',
    } as Record<string, string>,
  },
} as const;

export function getT(lang: LangCode) {
  return TRANSLATIONS[lang] || TRANSLATIONS.fr;
}
