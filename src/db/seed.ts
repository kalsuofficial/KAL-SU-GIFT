import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  coupons,
  exchangeRates,
  products,
  productVariants,
  profiles,
  promotions,
  roles,
  systemSettings,
} from './schema.ts';
import { hashPassword } from '../lib/crypto.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function ensureCashierRoleAndDefaults(): Promise<void> {
  const existingCashier = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, 'cashier'))
    .limit(1);

  if (!existingCashier[0]) {
    const [cashierRole] = await db
      .insert(roles)
      .values({
        name: 'cashier',
        description: 'Caissier / Guichet POS : encaissements Espèces, MonCash/NatCash et ventes comptoir',
        permissions: [
          'orders:read_all',
          'orders:create',
          'orders:manage',
          'payments:verify',
          'cashier:pos',
          'customers:read',
        ],
      })
      .onConflictDoNothing()
      .returning();

    if (cashierRole) {
      await db
        .insert(profiles)
        .values({
          fullName: 'Caissier Principal KAL-SU',
          email: 'caissier@kalsugift.ht',
          phone: '+509 3700-0001',
          passwordHash: hashPassword('KalSuCaisse2026!'),
          roleId: cashierRole.id,
          cashierStation: 'Guichet Central — Port-au-Prince',
          preferredLang: 'fr',
          preferredCurrency: 'HTG',
        })
        .onConflictDoNothing();
    }
  }
}

async function runSeed(): Promise<void> {
  const existingRoles = await db.select({ value: count() }).from(roles);
  if ((existingRoles[0]?.value ?? 0) > 0) {
    await ensureCashierRoleAndDefaults();
    return;
  }

  // 1. Seed Roles
  const roleSeeds = [
    {
      name: 'customer',
      description: 'Client standard pouvant commander, payer et suivre ses achats',
      permissions: ['orders:create', 'orders:read_own', 'tickets:create'],
    },
    {
      name: 'cashier',
      description: 'Caissier / Guichet POS : encaissements Espèces, MonCash/NatCash et ventes comptoir',
      permissions: [
        'orders:read_all',
        'orders:create',
        'orders:manage',
        'payments:verify',
        'cashier:pos',
        'customers:read',
      ],
    },
    {
      name: 'support',
      description: 'Agent de support client et gestion des tickets',
      permissions: ['orders:read_all', 'tickets:manage', 'notifications:send', 'customers:read'],
    },
    {
      name: 'finance',
      description: 'Gestion financière, vérification MonCash/NatCash, taux de change et remboursements',
      permissions: [
        'orders:read_all',
        'payments:verify',
        'refunds:manage',
        'finance:read',
        'rates:update',
      ],
    },
    {
      name: 'admin',
      description: 'Administrateur boutique, catalogue, fournisseurs API et commandes',
      permissions: [
        'products:manage',
        'orders:manage',
        'orders:read_all',
        'payments:verify',
        'cashier:pos',
        'suppliers:manage',
        'promotions:manage',
        'tickets:manage',
        'finance:read',
        'rates:update',
        'customers:read',
        'refunds:manage',
      ],
    },
    {
      name: 'super_admin',
      description: 'Contrôle complet plateforme, rôles, sécurité et paramètres système',
      permissions: ['*'],
    },
  ];

  const insertedRoles = await db.insert(roles).values(roleSeeds).returning();
  const superAdminRole = insertedRoles.find((r) => r.name === 'super_admin')!;
  const cashierRole = insertedRoles.find((r) => r.name === 'cashier')!;

  // Seed default super admin accounts
  await db
    .insert(profiles)
    .values([
      {
        fullName: 'Administrateur KAL-SU',
        email: 'admin@kalsugift.ht',
        phone: '+509 3700-0000',
        passwordHash: hashPassword('KalSuAdmin2026!'),
        roleId: superAdminRole.id,
        preferredLang: 'fr',
        preferredCurrency: 'HTG',
      },
      {
        fullName: 'Wadley Michel',
        email: 'michelwadley2@gmail.com',
        phone: '+509 3700-0000',
        passwordHash: hashPassword('KalSuAdmin2026!'),
        roleId: superAdminRole.id,
        preferredLang: 'fr',
        preferredCurrency: 'HTG',
      },
      {
        fullName: 'Caissier Principal KAL-SU',
        email: 'caissier@kalsugift.ht',
        phone: '+509 3700-0001',
        passwordHash: hashPassword('KalSuCaisse2026!'),
        roleId: cashierRole.id,
        cashierStation: 'Guichet Central — Port-au-Prince',
        preferredLang: 'fr',
        preferredCurrency: 'HTG',
      },
    ])
    .onConflictDoNothing();

  await db
    .update(profiles)
    .set({ roleId: superAdminRole.id, updatedAt: new Date() })
    .where(eq(profiles.email, 'michelwadley2@gmail.com'));

  // 2. Seed Exchange Rate
  await db.insert(exchangeRates).values({
    baseCurrency: 'USD',
    targetCurrency: 'HTG',
    rate: '132.5000',
  });

  // 3. Seed System Settings
  await db
    .insert(systemSettings)
    .values([
      {
        key: 'moncash_merchant_number',
        value: '+509 3700-0000',
        isSecret: false,
        description: 'Numéro marchand officiel MonCash pour paiements manuels/API',
      },
      {
        key: 'moncash_merchant_code',
        value: '',
        isSecret: false,
        description: 'Code marchand / Business Code MonCash (optionnel, à configurer)',
      },
      {
        key: 'moncash_merchant_name',
        value: 'KAL-SU GIFT HAITI',
        isSecret: false,
        description: 'Nom du compte marchand affiché lors du paiement MonCash',
      },
      {
        key: 'moncash_fee_percent',
        value: '2.00',
        isSecret: false,
        description: 'Frais de passerelle MonCash estimés (%)',
      },
      {
        key: 'moncash_env',
        value: 'sandbox',
        isSecret: false,
        description: 'Environnement MonCash API (sandbox ou production)',
      },
      {
        key: 'moncash_verification_mode',
        value: 'manual',
        isSecret: false,
        description: 'Mode de validation MonCash (manual ou auto_api)',
      },
      {
        key: 'moncash_api_url',
        value: 'https://sandbox.moncashbutton.digicelgroup.com/Api',
        isSecret: false,
        description: 'URL de base de l’API MonCash Digicel',
      },
      {
        key: 'natcash_merchant_number',
        value: '+509 4100-0000',
        isSecret: false,
        description: 'Numéro marchand officiel NatCash pour paiements Natcom',
      },
      {
        key: 'natcash_merchant_code',
        value: '',
        isSecret: false,
        description: 'Code marchand / Short Code NatCash (optionnel, à configurer)',
      },
      {
        key: 'natcash_merchant_id',
        value: '',
        isSecret: false,
        description: 'Identifiant partenaire API NatCash (Merchant ID)',
      },
      {
        key: 'natcash_merchant_name',
        value: 'KAL-SU GIFT NATCASH',
        isSecret: false,
        description: 'Nom du compte marchand affiché lors du paiement NatCash',
      },
      {
        key: 'natcash_fee_percent',
        value: '1.50',
        isSecret: false,
        description: 'Frais de passerelle NatCash estimés (%)',
      },
      {
        key: 'natcash_env',
        value: 'sandbox',
        isSecret: false,
        description: 'Environnement NatCash API (sandbox ou production)',
      },
      {
        key: 'natcash_verification_mode',
        value: 'manual',
        isSecret: false,
        description: 'Mode de validation NatCash (manual ou auto_api)',
      },
      {
        key: 'natcash_api_url',
        value: '',
        isSecret: false,
        description: 'URL de base de l’API NatCash Natcom',
      },
      {
        key: 'whatsapp_support_number',
        value: '+50937000000',
        isSecret: false,
        description: 'Numéro WhatsApp officiel du service client KAL-SU GIFT',
      },
      {
        key: 'support_email',
        value: 'support@kalsugift.ht',
        isSecret: false,
        description: 'Email officiel du service client',
      },
    ])
    .onConflictDoNothing();

  // 4. Seed Categories
  const insertedCats = await db
    .insert(categories)
    .values([
      {
        slug: 'gift-cards',
        type: 'gift_card',
        nameFr: 'Cartes Cadeaux Numériques',
        nameEs: 'Tarjetas de Regalo Digitales',
        nameEn: 'Digital Gift Cards',
        descriptionFr: 'Codes officiels vérifiés par région pour boutiques, streaming et consoles.',
        descriptionEs: 'Códigos oficiales verificados por región para tiendas, streaming y consolas.',
        descriptionEn: 'Region-verified digital codes for app stores, streaming, and consoles.',
        imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
        sortOrder: 1,
      },
      {
        slug: 'gaming-topups',
        type: 'gaming_topup',
        nameFr: 'Recharges Jeux Vidéo & DLS',
        nameEs: 'Recargas de Videojuegos y DLS',
        nameEn: 'Gaming & DLS Top-Ups',
        descriptionFr: 'Recharges directes par Player ID sans jamais partager votre mot de passe.',
        descriptionEs: 'Recargas directas por Player ID sin compartir jamás tu contraseña.',
        descriptionEn: 'Direct Player ID top-ups without ever sharing your account password.',
        imageUrl: '/src/assets/images/cat_gaming_topup_1795058562435.jpg',
        sortOrder: 2,
      },
    ])
    .returning();

  const giftCat = insertedCats.find((c) => c.slug === 'gift-cards')!;
  const gameCat = insertedCats.find((c) => c.slug === 'gaming-topups')!;

  // 5. Seed Products & Variants (marked isDemo: true until live supplier sync)
  interface SeedProduct {
    categoryId: number;
    slug: string;
    brand: string;
    name: string;
    productType: string;
    descriptionFr: string;
    descriptionEs: string;
    descriptionEn: string;
    imageUrl: string;
    accentHex: string;
    compatibleRegions: string;
    regionRestrictionNoteFr: string;
    regionRestrictionNoteEs: string;
    regionRestrictionNoteEn: string;
    deliveryTimeLabel: string;
    requiresPlayerId: boolean;
    isPopular: boolean;
    isNew: boolean;
    isPromo: boolean;
    marginPercent: string;
    variants: Array<{
      label: string;
      faceValue: string;
      faceCurrency: string;
      supplierCostUsd: string;
      sellingPriceUsd: string;
      promoPriceUsd?: string;
      stockStatus: string;
    }>;
  }

  const catalog: SeedProduct[] = [
    {
      categoryId: giftCat.id,
      slug: 'google-play-us',
      brand: 'Google Play',
      name: 'Google Play Gift Card (USA)',
      productType: 'gift_card',
      descriptionFr: 'Crédit officiel Google Play pour applications, jeux Android, films et livres.',
      descriptionEs: 'Crédito oficial de Google Play para aplicaciones, juegos Android, películas y libros.',
      descriptionEn: 'Official Google Play credit for Android apps, games, movies, and books.',
      imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
      accentHex: '#2563EB',
      compatibleRegions: 'USA (USD)',
      regionRestrictionNoteFr: 'Valide uniquement sur un compte Google Play configuré aux États-Unis (USD). Non remboursable après envoi.',
      regionRestrictionNoteEs: 'Válida únicamente para cuentas Google Play configuradas en Estados Unidos (USD).',
      regionRestrictionNoteEn: 'Valid only on Google Play accounts set to the United States (USD) region.',
      deliveryTimeLabel: '5-15 min',
      requiresPlayerId: false,
      isPopular: true,
      isNew: false,
      isPromo: false,
      marginPercent: '12.00',
      variants: [
        { label: '$10 USD', faceValue: '10', faceCurrency: 'USD', supplierCostUsd: '9.40', sellingPriceUsd: '10.80', stockStatus: 'manual_delivery' },
        { label: '$25 USD', faceValue: '25', faceCurrency: 'USD', supplierCostUsd: '23.50', sellingPriceUsd: '26.50', stockStatus: 'manual_delivery' },
        { label: '$50 USD', faceValue: '50', faceCurrency: 'USD', supplierCostUsd: '47.00', sellingPriceUsd: '52.50', stockStatus: 'manual_delivery' },
        { label: '$100 USD', faceValue: '100', faceCurrency: 'USD', supplierCostUsd: '94.00', sellingPriceUsd: '104.00', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: giftCat.id,
      slug: 'apple-gift-card-us',
      brand: 'Apple',
      name: 'Apple Gift Card (USA)',
      productType: 'gift_card',
      descriptionFr: 'Recharge App Store, iCloud+, Apple Music et achats intégrés iOS.',
      descriptionEs: 'Recarga App Store, iCloud+, Apple Music y compras integradas en iOS.',
      descriptionEn: 'Top up App Store, iCloud+, Apple Music, and iOS in-app purchases.',
      imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
      accentHex: '#D4AF37',
      compatibleRegions: 'USA (USD)',
      regionRestrictionNoteFr: 'Compatible exclusivement avec un Apple ID région États-Unis.',
      regionRestrictionNoteEs: 'Compatible exclusivamente con Apple ID de región Estados Unidos.',
      regionRestrictionNoteEn: 'Exclusively compatible with United States Apple ID accounts.',
      deliveryTimeLabel: '5-15 min',
      requiresPlayerId: false,
      isPopular: true,
      isNew: false,
      isPromo: false,
      marginPercent: '11.00',
      variants: [
        { label: '$10 USD', faceValue: '10', faceCurrency: 'USD', supplierCostUsd: '9.50', sellingPriceUsd: '10.90', stockStatus: 'manual_delivery' },
        { label: '$25 USD', faceValue: '25', faceCurrency: 'USD', supplierCostUsd: '23.75', sellingPriceUsd: '26.75', stockStatus: 'manual_delivery' },
        { label: '$50 USD', faceValue: '50', faceCurrency: 'USD', supplierCostUsd: '47.50', sellingPriceUsd: '53.00', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: giftCat.id,
      slug: 'amazon-gift-card-us',
      brand: 'Amazon',
      name: 'Amazon.com Gift Card (USA)',
      productType: 'gift_card',
      descriptionFr: 'Solde Amazon.com pour achats en ligne et expéditions vers Haïti via transitaire.',
      descriptionEs: 'Saldo Amazon.com para compras en línea y envíos internacionales.',
      descriptionEn: 'Amazon.com balance for online shopping and international freight forwarders.',
      imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
      accentHex: '#F59E0B',
      compatibleRegions: 'USA (Amazon.com)',
      regionRestrictionNoteFr: 'Utilisable uniquement sur Amazon.com (USA), non valide sur Amazon.fr ou Amazon.ca.',
      regionRestrictionNoteEs: 'Utilizable únicamente en Amazon.com (USA), no válida en otros sitios.',
      regionRestrictionNoteEn: 'Redeemable only on Amazon.com (USA). Not valid on regional Amazon sites.',
      deliveryTimeLabel: '10-20 min',
      requiresPlayerId: false,
      isPopular: true,
      isNew: false,
      isPromo: false,
      marginPercent: '10.00',
      variants: [
        { label: '$15 USD', faceValue: '15', faceCurrency: 'USD', supplierCostUsd: '14.55', sellingPriceUsd: '16.20', stockStatus: 'manual_delivery' },
        { label: '$25 USD', faceValue: '25', faceCurrency: 'USD', supplierCostUsd: '24.25', sellingPriceUsd: '26.90', stockStatus: 'manual_delivery' },
        { label: '$50 USD', faceValue: '50', faceCurrency: 'USD', supplierCostUsd: '48.50', sellingPriceUsd: '53.50', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: giftCat.id,
      slug: 'steam-wallet-global',
      brand: 'Steam',
      name: 'Steam Wallet Code',
      productType: 'gift_card',
      descriptionFr: 'Ajoutez des fonds à votre porte-monnaie Steam pour jeux PC et DLC.',
      descriptionEs: 'Añade fondos a tu cartera Steam para juegos de PC y DLC.',
      descriptionEn: 'Add funds to your Steam Wallet for PC games, items, and DLC.',
      imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
      accentHex: '#3B82F6',
      compatibleRegions: 'Global (USD)',
      regionRestrictionNoteFr: 'Code en USD — fonctionne sur les comptes Steam configurés en USD ou régions compatibles.',
      regionRestrictionNoteEs: 'Código en USD — compatible con cuentas Steam configuradas en USD.',
      regionRestrictionNoteEn: 'USD Steam code — compatible with Steam accounts billed in USD.',
      deliveryTimeLabel: '5-10 min',
      requiresPlayerId: false,
      isPopular: true,
      isNew: false,
      isPromo: true,
      marginPercent: '12.50',
      variants: [
        { label: '$10 USD', faceValue: '10', faceCurrency: 'USD', supplierCostUsd: '9.30', sellingPriceUsd: '10.75', promoPriceUsd: '10.25', stockStatus: 'manual_delivery' },
        { label: '$20 USD', faceValue: '20', faceCurrency: 'USD', supplierCostUsd: '18.60', sellingPriceUsd: '21.30', promoPriceUsd: '20.50', stockStatus: 'manual_delivery' },
        { label: '$50 USD', faceValue: '50', faceCurrency: 'USD', supplierCostUsd: '46.50', sellingPriceUsd: '52.00', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: giftCat.id,
      slug: 'playstation-store-us',
      brand: 'PlayStation',
      name: 'PlayStation Store (USA)',
      productType: 'gift_card',
      descriptionFr: 'Crédit PSN pour PS4, PS5, jeux numériques et abonnements PlayStation Plus.',
      descriptionEs: 'Crédito PSN para PS4, PS5, juegos digitales y PlayStation Plus.',
      descriptionEn: 'PSN Wallet credit for PS4, PS5 digital games, and PlayStation Plus.',
      imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
      accentHex: '#2563EB',
      compatibleRegions: 'USA (PSN US)',
      regionRestrictionNoteFr: 'Uniquement pour les comptes PlayStation Network enregistrés aux États-Unis.',
      regionRestrictionNoteEs: 'Solo para cuentas PlayStation Network registradas en Estados Unidos.',
      regionRestrictionNoteEn: 'Only for PlayStation Network accounts registered in the United States.',
      deliveryTimeLabel: '5-15 min',
      requiresPlayerId: false,
      isPopular: false,
      isNew: false,
      isPromo: false,
      marginPercent: '11.50',
      variants: [
        { label: '$10 USD', faceValue: '10', faceCurrency: 'USD', supplierCostUsd: '9.20', sellingPriceUsd: '10.60', stockStatus: 'manual_delivery' },
        { label: '$25 USD', faceValue: '25', faceCurrency: 'USD', supplierCostUsd: '23.00', sellingPriceUsd: '26.20', stockStatus: 'manual_delivery' },
        { label: '$50 USD', faceValue: '50', faceCurrency: 'USD', supplierCostUsd: '46.00', sellingPriceUsd: '51.80', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: giftCat.id,
      slug: 'xbox-gift-card-us',
      brand: 'Xbox',
      name: 'Xbox Digital Gift Card (USA)',
      productType: 'gift_card',
      descriptionFr: 'Jeux Xbox Series X/S, Xbox One, Game Pass et extensions Microsoft Store.',
      descriptionEs: 'Juegos Xbox Series X/S, Xbox One, Game Pass y Microsoft Store.',
      descriptionEn: 'Xbox Series X/S, Xbox One games, Game Pass, and Microsoft Store credit.',
      imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
      accentHex: '#10B981',
      compatibleRegions: 'USA (Microsoft US)',
      regionRestrictionNoteFr: 'Compte Microsoft / Xbox configuré en région États-Unis requis.',
      regionRestrictionNoteEs: 'Requiere cuenta Microsoft / Xbox en región Estados Unidos.',
      regionRestrictionNoteEn: 'Requires a Microsoft / Xbox account set to the United States region.',
      deliveryTimeLabel: '5-15 min',
      requiresPlayerId: false,
      isPopular: false,
      isNew: true,
      isPromo: false,
      marginPercent: '11.00',
      variants: [
        { label: '$10 USD', faceValue: '10', faceCurrency: 'USD', supplierCostUsd: '9.20', sellingPriceUsd: '10.60', stockStatus: 'manual_delivery' },
        { label: '$25 USD', faceValue: '25', faceCurrency: 'USD', supplierCostUsd: '23.00', sellingPriceUsd: '26.00', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: giftCat.id,
      slug: 'nintendo-eshop-us',
      brand: 'Nintendo',
      name: 'Nintendo eShop Card (USA)',
      productType: 'gift_card',
      descriptionFr: 'Achetez jeux et DLC sur Nintendo Switch depuis le Nintendo eShop US.',
      descriptionEs: 'Compra juegos y DLC en Nintendo Switch desde Nintendo eShop US.',
      descriptionEn: 'Purchase Nintendo Switch games and DLC on the US Nintendo eShop.',
      imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
      accentHex: '#EF4444',
      compatibleRegions: 'USA (Nintendo US)',
      regionRestrictionNoteFr: 'Valide uniquement sur les comptes Nintendo Amérique du Nord (USD).',
      regionRestrictionNoteEs: 'Válida solo en cuentas Nintendo de Norteamérica (USD).',
      regionRestrictionNoteEn: 'Valid only for North America (USD) Nintendo accounts.',
      deliveryTimeLabel: '5-15 min',
      requiresPlayerId: false,
      isPopular: false,
      isNew: false,
      isPromo: false,
      marginPercent: '12.00',
      variants: [
        { label: '$10 USD', faceValue: '10', faceCurrency: 'USD', supplierCostUsd: '9.30', sellingPriceUsd: '10.70', stockStatus: 'manual_delivery' },
        { label: '$20 USD', faceValue: '20', faceCurrency: 'USD', supplierCostUsd: '18.60', sellingPriceUsd: '21.20', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: giftCat.id,
      slug: 'roblox-robux-global',
      brand: 'Roblox',
      name: 'Roblox Gift Card (Robux)',
      productType: 'gift_card',
      descriptionFr: 'Convertible en Robux ou abonnement Roblox Premium sur PC et mobile.',
      descriptionEs: 'Canjeable por Robux o suscripción Roblox Premium en PC y móvil.',
      descriptionEn: 'Redeemable for Robux or Roblox Premium across PC and mobile.',
      imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
      accentHex: '#60A5FA',
      compatibleRegions: 'Global (Multi-région)',
      regionRestrictionNoteFr: 'Compatible mondialement. Le montant converti dépend de la devise du compte.',
      regionRestrictionNoteEs: 'Compatible mundialmente según la moneda de tu cuenta Roblox.',
      regionRestrictionNoteEn: 'Globally compatible. Robux amount scales to account currency.',
      deliveryTimeLabel: '5-10 min',
      requiresPlayerId: false,
      isPopular: true,
      isNew: false,
      isPromo: false,
      marginPercent: '13.00',
      variants: [
        { label: '$10 USD (800 Robux)', faceValue: '10', faceCurrency: 'USD', supplierCostUsd: '9.10', sellingPriceUsd: '10.60', stockStatus: 'manual_delivery' },
        { label: '$25 USD (2000 Robux)', faceValue: '25', faceCurrency: 'USD', supplierCostUsd: '22.75', sellingPriceUsd: '26.25', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: giftCat.id,
      slug: 'spotify-premium-us',
      brand: 'Spotify',
      name: 'Spotify Premium (USA)',
      productType: 'gift_card',
      descriptionFr: 'Abonnement Spotify Premium individuel sans publicité ni carte bancaire internationale.',
      descriptionEs: 'Suscripción Spotify Premium individual sin tarjeta internacional.',
      descriptionEn: 'Spotify Premium individual subscription without needing an international bank card.',
      imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
      accentHex: '#22C55E',
      compatibleRegions: 'USA (USD)',
      regionRestrictionNoteFr: 'Valide pour comptes Spotify US individuels (incompatible Duo/Famille/Étudiant).',
      regionRestrictionNoteEs: 'Válida para cuentas Spotify US individuales.',
      regionRestrictionNoteEn: 'Valid for US individual Spotify accounts only.',
      deliveryTimeLabel: '10-20 min',
      requiresPlayerId: false,
      isPopular: false,
      isNew: true,
      isPromo: false,
      marginPercent: '14.00',
      variants: [
        { label: '$10 USD (1 Mois)', faceValue: '10', faceCurrency: 'USD', supplierCostUsd: '9.40', sellingPriceUsd: '11.20', stockStatus: 'manual_delivery' },
        { label: '$30 USD (3 Mois)', faceValue: '30', faceCurrency: 'USD', supplierCostUsd: '28.20', sellingPriceUsd: '32.50', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: giftCat.id,
      slug: 'netflix-gift-card-us',
      brand: 'Netflix',
      name: 'Netflix Gift Card (USA)',
      productType: 'gift_card',
      descriptionFr: 'Payez votre abonnement Netflix en toute autonomie par carte prépayée numérique.',
      descriptionEs: 'Paga tu suscripción Netflix de forma prepagada sin tarjeta bancaria.',
      descriptionEn: 'Pay your Netflix subscription seamlessly using digital prepaid credit.',
      imageUrl: '/src/assets/images/cat_gift_cards_1795058562137.jpg',
      accentHex: '#DC2626',
      compatibleRegions: 'USA (USD)',
      regionRestrictionNoteFr: 'Valide sur les comptes Netflix facturés en USD.',
      regionRestrictionNoteEs: 'Válida en cuentas Netflix facturadas en USD.',
      regionRestrictionNoteEn: 'Valid on Netflix accounts billed in USD.',
      deliveryTimeLabel: '10-20 min',
      requiresPlayerId: false,
      isPopular: true,
      isNew: false,
      isPromo: false,
      marginPercent: '12.00',
      variants: [
        { label: '$15 USD', faceValue: '15', faceCurrency: 'USD', supplierCostUsd: '14.20', sellingPriceUsd: '16.50', stockStatus: 'manual_delivery' },
        { label: '$25 USD', faceValue: '25', faceCurrency: 'USD', supplierCostUsd: '23.70', sellingPriceUsd: '27.00', stockStatus: 'manual_delivery' },
        { label: '$50 USD', faceValue: '50', faceCurrency: 'USD', supplierCostUsd: '47.40', sellingPriceUsd: '53.50', stockStatus: 'manual_delivery' },
      ],
    },

    // GAMING TOP-UPS
    {
      categoryId: gameCat.id,
      slug: 'dream-league-soccer',
      brand: 'Dream League Soccer',
      name: 'Dream League Soccer (DLS) — Gems & Coins',
      productType: 'dls_topup',
      descriptionFr: 'Recharge directe Dream League Soccer par Player ID uniquement. Livraison rapide sans mot de passe.',
      descriptionEs: 'Recarga directa de Dream League Soccer solo con tu Player ID. Sin contraseña.',
      descriptionEn: 'Direct Dream League Soccer top-up via Player ID only. No password required.',
      imageUrl: '/src/assets/images/dls_stadium_spotlight_1795058562767.jpg',
      accentHex: '#D4AF37',
      compatibleRegions: 'Global (Android & iOS)',
      regionRestrictionNoteFr: 'Vérifiez attentivement votre Player ID dans Paramètres > Avancé. Ne donnez jamais votre mot de passe.',
      regionRestrictionNoteEs: 'Verifica cuidadosamente tu Player ID en Ajustes > Avanzado. Nunca compartas tu contraseña.',
      regionRestrictionNoteEn: 'Verify your Player ID inside Settings > Advanced. Never share your password.',
      deliveryTimeLabel: '5-20 min',
      requiresPlayerId: true,
      isPopular: true,
      isNew: true,
      isPromo: true,
      marginPercent: '18.00',
      variants: [
        { label: '500 Gems DLS', faceValue: '500 Gems', faceCurrency: 'GEMS', supplierCostUsd: '3.80', sellingPriceUsd: '4.95', promoPriceUsd: '4.50', stockStatus: 'manual_delivery' },
        { label: '1 500 Gems DLS', faceValue: '1500 Gems', faceCurrency: 'GEMS', supplierCostUsd: '8.90', sellingPriceUsd: '11.50', promoPriceUsd: '10.60', stockStatus: 'manual_delivery' },
        { label: '4 000 Gems DLS', faceValue: '4000 Gems', faceCurrency: 'GEMS', supplierCostUsd: '18.20', sellingPriceUsd: '22.90', stockStatus: 'manual_delivery' },
        { label: '15 000 Coins DLS', faceValue: '15000 Coins', faceCurrency: 'COINS', supplierCostUsd: '4.10', sellingPriceUsd: '5.40', stockStatus: 'manual_delivery' },
        { label: 'DLS Season Pass', faceValue: 'Season Pass', faceCurrency: 'PASS', supplierCostUsd: '4.50', sellingPriceUsd: '5.95', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: gameCat.id,
      slug: 'free-fire',
      brand: 'Free Fire',
      name: 'Free Fire — Diamants',
      productType: 'gaming_topup',
      descriptionFr: 'Recharge officielle de diamants Garena Free Fire par Player ID (UID).',
      descriptionEs: 'Recarga oficial de diamantes Garena Free Fire por Player ID (UID).',
      descriptionEn: 'Official Garena Free Fire Diamonds top-up via Player ID (UID).',
      imageUrl: '/src/assets/images/cat_gaming_topup_1795058562435.jpg',
      accentHex: '#F97316',
      compatibleRegions: 'Global / Latam / NA',
      regionRestrictionNoteFr: 'Compatible avec comptes Free Fire Global & Amériques (UID numérique requis).',
      regionRestrictionNoteEs: 'Compatible con cuentas Free Fire Global y Américas (UID numérico requerido).',
      regionRestrictionNoteEn: 'Compatible with Global & Americas Free Fire UIDs.',
      deliveryTimeLabel: '2-10 min',
      requiresPlayerId: true,
      isPopular: true,
      isNew: false,
      isPromo: true,
      marginPercent: '15.00',
      variants: [
        { label: '100 + 10 Diamants', faceValue: '110', faceCurrency: 'DIAMONDS', supplierCostUsd: '0.92', sellingPriceUsd: '1.25', stockStatus: 'manual_delivery' },
        { label: '310 + 31 Diamants', faceValue: '341', faceCurrency: 'DIAMONDS', supplierCostUsd: '2.75', sellingPriceUsd: '3.50', promoPriceUsd: '3.20', stockStatus: 'manual_delivery' },
        { label: '520 + 52 Diamants', faceValue: '572', faceCurrency: 'DIAMONDS', supplierCostUsd: '4.55', sellingPriceUsd: '5.75', stockStatus: 'manual_delivery' },
        { label: '1060 + 106 Diamants', faceValue: '1166', faceCurrency: 'DIAMONDS', supplierCostUsd: '9.10', sellingPriceUsd: '11.20', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: gameCat.id,
      slug: 'pubg-mobile',
      brand: 'PUBG Mobile',
      name: 'PUBG Mobile — UC',
      productType: 'gaming_topup',
      descriptionFr: 'Unknown Cash (UC) PUBG Mobile crédité directement sur votre Character ID.',
      descriptionEs: 'Unknown Cash (UC) PUBG Mobile acreditado directamente a tu Character ID.',
      descriptionEn: 'PUBG Mobile Unknown Cash (UC) credited directly to your Character ID.',
      imageUrl: '/src/assets/images/cat_gaming_topup_1795058562435.jpg',
      accentHex: '#EAB308',
      compatibleRegions: 'Global (Hors KR/JP/CN)',
      regionRestrictionNoteFr: 'Valable sur PUBG Mobile Global (non compatible serveurs Chine, Japon ou Corée).',
      regionRestrictionNoteEs: 'Válido para PUBG Mobile Global (excepto China, Japón y Corea).',
      regionRestrictionNoteEn: 'Valid for PUBG Mobile Global (excludes CN/JP/KR servers).',
      deliveryTimeLabel: '5-15 min',
      requiresPlayerId: true,
      isPopular: true,
      isNew: false,
      isPromo: false,
      marginPercent: '14.00',
      variants: [
        { label: '60 UC', faceValue: '60', faceCurrency: 'UC', supplierCostUsd: '0.88', sellingPriceUsd: '1.15', stockStatus: 'manual_delivery' },
        { label: '325 UC', faceValue: '325', faceCurrency: 'UC', supplierCostUsd: '4.35', sellingPriceUsd: '5.35', stockStatus: 'manual_delivery' },
        { label: '660 UC', faceValue: '660', faceCurrency: 'UC', supplierCostUsd: '8.70', sellingPriceUsd: '10.50', stockStatus: 'manual_delivery' },
        { label: '1800 UC', faceValue: '1800', faceCurrency: 'UC', supplierCostUsd: '21.80', sellingPriceUsd: '25.90', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: gameCat.id,
      slug: 'mobile-legends',
      brand: 'Mobile Legends',
      name: 'Mobile Legends — Diamants',
      productType: 'gaming_topup',
      descriptionFr: 'Recharge rapide Mobile Legends: Bang Bang avec User ID + Zone ID.',
      descriptionEs: 'Recarga rápida de Mobile Legends: Bang Bang con User ID + Zone ID.',
      descriptionEn: 'Fast Mobile Legends: Bang Bang diamond top-up via User ID + Zone ID.',
      imageUrl: '/src/assets/images/cat_gaming_topup_1795058562435.jpg',
      accentHex: '#3B82F6',
      compatibleRegions: 'Global (Hors ID/MY)',
      regionRestrictionNoteFr: 'Indiquez votre User ID et Zone ID (ex: 12345678 (1234)).',
      regionRestrictionNoteEs: 'Indica tu User ID y Zone ID (ej: 12345678 (1234)).',
      regionRestrictionNoteEn: 'Provide both User ID and Zone ID (e.g. 12345678 (1234)).',
      deliveryTimeLabel: '5-15 min',
      requiresPlayerId: true,
      isPopular: false,
      isNew: false,
      isPromo: false,
      marginPercent: '14.00',
      variants: [
        { label: '86 Diamants', faceValue: '86', faceCurrency: 'DIAMONDS', supplierCostUsd: '1.35', sellingPriceUsd: '1.75', stockStatus: 'manual_delivery' },
        { label: '172 Diamants', faceValue: '172', faceCurrency: 'DIAMONDS', supplierCostUsd: '2.70', sellingPriceUsd: '3.40', stockStatus: 'manual_delivery' },
        { label: '429 Diamants', faceValue: '429', faceCurrency: 'DIAMONDS', supplierCostUsd: '6.65', sellingPriceUsd: '8.10', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: gameCat.id,
      slug: 'call-of-duty-mobile',
      brand: 'Call of Duty Mobile',
      name: 'Call of Duty: Mobile — CP',
      productType: 'gaming_topup',
      descriptionFr: 'Points COD (CP) pour Battle Pass et packs armes Call of Duty Mobile.',
      descriptionEs: 'Puntos COD (CP) para Pase de Batalla y lotes en Call of Duty Mobile.',
      descriptionEn: 'COD Points (CP) for Battle Pass and weapon bundles in Call of Duty Mobile.',
      imageUrl: '/src/assets/images/cat_gaming_topup_1795058562435.jpg',
      accentHex: '#F59E0B',
      compatibleRegions: 'Global (Activision)',
      regionRestrictionNoteFr: 'Compatible version Global Activision (UID joueur requis).',
      regionRestrictionNoteEs: 'Compatible versión Global Activision (UID de jugador requerido).',
      regionRestrictionNoteEn: 'Compatible with Global Activision version (Player UID required).',
      deliveryTimeLabel: '5-15 min',
      requiresPlayerId: true,
      isPopular: false,
      isNew: true,
      isPromo: false,
      marginPercent: '15.00',
      variants: [
        { label: '80 CP', faceValue: '80', faceCurrency: 'CP', supplierCostUsd: '0.90', sellingPriceUsd: '1.20', stockStatus: 'manual_delivery' },
        { label: '420 CP', faceValue: '420', faceCurrency: 'CP', supplierCostUsd: '4.50', sellingPriceUsd: '5.50', stockStatus: 'manual_delivery' },
        { label: '880 CP', faceValue: '880', faceCurrency: 'CP', supplierCostUsd: '9.00', sellingPriceUsd: '10.90', stockStatus: 'manual_delivery' },
      ],
    },
    {
      categoryId: gameCat.id,
      slug: 'ea-fc-mobile',
      brand: 'EA SPORTS FC Mobile',
      name: 'EA SPORTS FC Mobile — FC Points',
      productType: 'gaming_topup',
      descriptionFr: 'FC Points officiels pour packs Ultimate Team et Pass Étoile sur FC Mobile.',
      descriptionEs: 'FC Points oficiales para sobres Ultimate Team y Pase Estelar en FC Mobile.',
      descriptionEn: 'Official FC Points for Ultimate Team packs and Star Pass in FC Mobile.',
      imageUrl: '/src/assets/images/dls_stadium_spotlight_1795058562767.jpg',
      accentHex: '#10B981',
      compatibleRegions: 'Global (Android & iOS)',
      regionRestrictionNoteFr: 'Utilisez votre Player UID FC Mobile (disponible dans Paramètres du jeu).',
      regionRestrictionNoteEs: 'Usa tu Player UID de FC Mobile (disponible en Ajustes del juego).',
      regionRestrictionNoteEn: 'Use your FC Mobile Player UID found in game settings.',
      deliveryTimeLabel: '5-15 min',
      requiresPlayerId: true,
      isPopular: true,
      isNew: true,
      isPromo: false,
      marginPercent: '15.00',
      variants: [
        { label: '100 FC Points', faceValue: '100', faceCurrency: 'FCP', supplierCostUsd: '0.92', sellingPriceUsd: '1.25', stockStatus: 'manual_delivery' },
        { label: '500 FC Points', faceValue: '500', faceCurrency: 'FCP', supplierCostUsd: '4.55', sellingPriceUsd: '5.60', stockStatus: 'manual_delivery' },
        { label: '1050 FC Points', faceValue: '1050', faceCurrency: 'FCP', supplierCostUsd: '9.10', sellingPriceUsd: '11.00', stockStatus: 'manual_delivery' },
      ],
    },
  ];

  for (const item of catalog) {
    const [insertedProduct] = await db
      .insert(products)
      .values({
        categoryId: item.categoryId,
        slug: item.slug,
        brand: item.brand,
        name: item.name,
        productType: item.productType,
        descriptionFr: item.descriptionFr,
        descriptionEs: item.descriptionEs,
        descriptionEn: item.descriptionEn,
        imageUrl: item.imageUrl,
        accentHex: item.accentHex,
        compatibleRegions: item.compatibleRegions,
        regionVerified: true,
        regionRestrictionNoteFr: item.regionRestrictionNoteFr,
        regionRestrictionNoteEs: item.regionRestrictionNoteEs,
        regionRestrictionNoteEn: item.regionRestrictionNoteEn,
        deliveryTimeLabel: item.deliveryTimeLabel,
        requiresPlayerId: item.requiresPlayerId,
        isPopular: item.isPopular,
        isNew: item.isNew,
        isPromo: item.isPromo,
        isDemo: true,
        marginPercent: item.marginPercent,
      })
      .returning();

    await db.insert(productVariants).values(
      item.variants.map((v) => ({
        productId: insertedProduct.id,
        label: v.label,
        faceValue: v.faceValue,
        faceCurrency: v.faceCurrency,
        supplierCostUsd: v.supplierCostUsd,
        sellingPriceUsd: v.sellingPriceUsd,
        promoPriceUsd: v.promoPriceUsd ?? null,
        stockStatus: v.stockStatus,
        stockQuantity: 25,
      }))
    );

    if (item.slug === 'dream-league-soccer') {
      await db.insert(promotions).values({
        titleFr: 'Offre Spéciale Dream League Soccer',
        titleEs: 'Oferta Especial Dream League Soccer',
        titleEn: 'Dream League Soccer Special Offer',
        descriptionFr: 'Tarifs réduits sur 500 et 1500 Gems DLS avec paiement MonCash ou NatCash.',
        descriptionEs: 'Precios reducidos en 500 y 1500 Gemas DLS con MonCash o NatCash.',
        descriptionEn: 'Discounted pricing on 500 and 1500 DLS Gems via MonCash or NatCash.',
        discountPercent: '8.00',
        productId: insertedProduct.id,
        isActive: true,
      });
    }
  }

  // 6. Seed Coupons
  await db
    .insert(coupons)
    .values([
      {
        code: 'KALSU10',
        discountType: 'percent',
        discountValue: '10.00',
        minOrderUsd: '5.00',
        maxUses: 500,
        isActive: true,
      },
      {
        code: 'HAITI2',
        discountType: 'fixed_usd',
        discountValue: '2.00',
        minOrderUsd: '15.00',
        maxUses: 200,
        isActive: true,
      },
    ])
    .onConflictDoNothing();
}

export async function getCustomerRoleId(): Promise<number> {
  const rows = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, 'customer'))
    .limit(1);
  if (!rows[0]) {
    throw new Error('Customer role not seeded');
  }
  return rows[0].id;
}
