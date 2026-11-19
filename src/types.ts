export type LangCode = 'fr' | 'es' | 'en';
export type CurrencyCode = 'USD' | 'HTG';

export interface ProductVariant {
  id: number;
  productId: number;
  label: string;
  faceValue: string;
  faceCurrency: string;
  supplierCostUsd: string;
  sellingPriceUsd: string;
  promoPriceUsd: string | null;
  stockStatus: string;
  stockQuantity: number;
  isActive: boolean;
}

export interface Product {
  id: number;
  categoryId: number;
  slug: string;
  brand: string;
  name: string;
  productType: string;
  descriptionFr: string;
  descriptionEs: string;
  descriptionEn: string;
  imageUrl: string | null;
  accentHex: string;
  compatibleRegions: string;
  regionVerified: boolean;
  regionRestrictionNoteFr: string;
  regionRestrictionNoteEs: string;
  regionRestrictionNoteEn: string;
  deliveryTimeLabel: string;
  requiresPlayerId: boolean;
  isPopular: boolean;
  isNew: boolean;
  isPromo: boolean;
  isDemo: boolean;
  marginPercent: string;
  variants: ProductVariant[];
}

export interface Category {
  id: number;
  slug: string;
  type: string;
  nameFr: string;
  nameEs: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEs: string;
  descriptionEn: string;
  imageUrl: string | null;
}

export interface Promotion {
  id: number;
  titleFr: string;
  titleEs: string;
  titleEn: string;
  descriptionFr: string;
  descriptionEs: string;
  descriptionEn: string;
  discountPercent: string;
  productId: number | null;
  isActive: boolean;
}

export interface MerchantConfig {
  moncashNumber: string;
  moncashMerchantCode?: string;
  moncashName: string;
  moncashFeePercent: number;
  natcashNumber: string;
  natcashMerchantCode?: string;
  natcashName: string;
  natcashFeePercent: number;
  whatsappNumber: string;
  supportEmail: string;
  moncashAutoApiEnabled: boolean;
  natcashAutoApiEnabled: boolean;
}

export interface PaymentGatewaysConfig {
  webhookEndpoint: string;
  moncash: {
    merchantNumber: string;
    merchantCode: string;
    merchantName: string;
    feePercent: number;
    env: 'sandbox' | 'production';
    verificationMode: 'manual' | 'auto_api';
    apiUrl: string;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasWebhookSecret: boolean;
    maskedClientId: string;
    maskedClientSecret: string;
    maskedWebhookSecret: string;
    autoApiConfigured: boolean;
    autoApiActive: boolean;
    lastTestStatus: string;
    lastTestMessage: string;
  };
  natcash: {
    merchantNumber: string;
    merchantCode: string;
    merchantId: string;
    merchantName: string;
    feePercent: number;
    env: 'sandbox' | 'production';
    verificationMode: 'manual' | 'auto_api';
    apiUrl: string;
    hasApiKey: boolean;
    hasApiSecret: boolean;
    hasWebhookSecret: boolean;
    maskedApiKey: string;
    maskedApiSecret: string;
    maskedWebhookSecret: string;
    autoApiConfigured: boolean;
    autoApiActive: boolean;
    lastTestStatus: string;
    lastTestMessage: string;
  };
}

export interface DlsCompatibility {
  automatedAvailable: boolean;
  supplierName: string | null;
  deliveryMode: 'api_automated' | 'manual_admin';
}

export interface StorefrontData {
  exchangeRate: number;
  categories: Category[];
  products: Product[];
  promotions: Promotion[];
  dlsCompatibility: DlsCompatibility;
  merchantConfig: MerchantConfig;
}

export interface UserProfile {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  roleName: string;
  permissions: string[];
  loyaltyPoints: number;
  preferredLang: string;
  preferredCurrency: string;
  cashierStation?: string | null;
}

export interface OrderRecord {
  id: number;
  orderRef: string;
  status: string;
  orderChannel?: string;
  cashierId?: number | null;
  customerDisplayName?: string | null;
  customerDisplayPhone?: string | null;
  currency: CurrencyCode;
  exchangeRateUsed: string;
  subtotalUsd: string;
  discountUsd: string;
  paymentFeeUsd: string;
  totalUsd: string;
  totalHtg: string;
  supplierCostUsd: string;
  estimatedProfitUsd: string;
  paymentMethod: 'moncash' | 'natcash' | 'cash';
  couponCode: string | null;
  playerId: string | null;
  deliveryPayload: {
    mode?: string;
    codeOrReceipt?: string;
    notes?: string;
    deliveredAt?: string;
  } | null;
  createdAt: string;
  customer?: {
    fullName: string;
    email: string;
    phone: string | null;
  } | null;
  items: Array<{
    id: number;
    productName: string;
    variantLabel: string;
    quantity: number;
    unitPriceUsd: string;
    regionCode: string;
  }>;
  payments: Array<{
    id: number;
    method: string;
    merchantNumber: string;
    transactionRef: string;
    amount: string;
    currency: string;
    status: string;
    verificationMode: string;
    rejectionReason: string | null;
    createdAt: string;
  }>;
  supplierTransactions?: Array<{
    id: number;
    status: string;
    errorMessage: string | null;
    externalOrderRef: string | null;
  }>;
  refunds?: Array<{
    id: number;
    amount: string;
    currency: string;
    reason: string;
    status: string;
  }>;
}
