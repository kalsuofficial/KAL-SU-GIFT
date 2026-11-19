import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. roles
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // 'customer' | 'cashier' | 'support' | 'finance' | 'admin' | 'super_admin'
  description: text('description').notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. profiles
export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(), // Firebase Auth UID (nullable for email/password accounts)
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  passwordHash: text('password_hash'),
  roleId: integer('role_id')
    .references(() => roles.id)
    .notNull(),
  loyaltyPoints: integer('loyalty_points').notNull().default(0),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until'),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: timestamp('reset_token_expires_at'),
  preferredLang: text('preferred_lang').notNull().default('fr'),
  preferredCurrency: text('preferred_currency').notNull().default('HTG'),
  cashierStation: text('cashier_station'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 3. categories
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  type: text('type').notNull(), // 'gift_card' | 'gaming_topup'
  nameFr: text('name_fr').notNull(),
  nameEs: text('name_es').notNull(),
  nameEn: text('name_en').notNull(),
  descriptionFr: text('description_fr').notNull(),
  descriptionEs: text('description_es').notNull(),
  descriptionEn: text('description_en').notNull(),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});

// 4. products
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .references(() => categories.id)
    .notNull(),
  slug: text('slug').notNull().unique(),
  brand: text('brand').notNull(),
  name: text('name').notNull(),
  productType: text('product_type').notNull(), // 'gift_card' | 'gaming_topup' | 'dls_topup'
  descriptionFr: text('description_fr').notNull(),
  descriptionEs: text('description_es').notNull(),
  descriptionEn: text('description_en').notNull(),
  imageUrl: text('image_url'),
  accentHex: text('accent_hex').notNull().default('#2563EB'),
  compatibleRegions: text('compatible_regions').notNull(), // e.g. 'USA (USD)' or 'Global'
  regionVerified: boolean('region_verified').notNull().default(true),
  regionRestrictionNoteFr: text('region_restriction_note_fr').notNull(),
  regionRestrictionNoteEs: text('region_restriction_note_es').notNull(),
  regionRestrictionNoteEn: text('region_restriction_note_en').notNull(),
  deliveryTimeLabel: text('delivery_time_label').notNull().default('5-15 min'),
  requiresPlayerId: boolean('requires_player_id').notNull().default(false),
  isPopular: boolean('is_popular').notNull().default(false),
  isNew: boolean('is_new').notNull().default(false),
  isPromo: boolean('is_promo').notNull().default(false),
  isDemo: boolean('is_demo').notNull().default(true),
  marginPercent: numeric('margin_percent', { precision: 6, scale: 2 }).notNull().default('12.00'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. product_variants
export const productVariants = pgTable('product_variants', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  label: text('label').notNull(), // e.g. '$10 US', '500 Gems', '100 Diamonds'
  faceValue: text('face_value').notNull(),
  faceCurrency: text('face_currency').notNull().default('USD'),
  supplierCostUsd: numeric('supplier_cost_usd', { precision: 12, scale: 2 }).notNull(),
  sellingPriceUsd: numeric('selling_price_usd', { precision: 12, scale: 2 }).notNull(),
  promoPriceUsd: numeric('promo_price_usd', { precision: 12, scale: 2 }),
  stockStatus: text('stock_status').notNull().default('manual_delivery'), // 'in_stock' | 'low_stock' | 'out_of_stock' | 'manual_delivery'
  stockQuantity: integer('stock_quantity').notNull().default(25),
  isActive: boolean('is_active').notNull().default(true),
});

// 6. suppliers
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  priority: text('priority').notNull().default('primary'), // 'primary' | 'secondary'
  apiUrl: text('api_url').notNull(),
  encryptedApiKey: text('encrypted_api_key').notNull(),
  encryptedApiSecret: text('encrypted_api_secret'),
  authType: text('auth_type').notNull().default('bearer'), // 'bearer' | 'x_api_key' | 'basic'
  supportsDls: boolean('supports_dls').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  lastTestStatus: text('last_test_status'), // 'success' | 'error' | null
  lastTestMessage: text('last_test_message'),
  lastTestedAt: timestamp('last_tested_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 7. supplier_products
export const supplierProducts = pgTable('supplier_products', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id')
    .references(() => suppliers.id)
    .notNull(),
  productVariantId: integer('product_variant_id').references(() => productVariants.id),
  externalSku: text('external_sku').notNull(),
  externalName: text('external_name').notNull(),
  regionCode: text('region_code').notNull().default('US'),
  supplierPriceUsd: numeric('supplier_price_usd', { precision: 12, scale: 2 }).notNull(),
  supplierStock: integer('supplier_stock').notNull().default(0),
  supportsDlsPlayerId: boolean('supports_dls_player_id').notNull().default(false),
  lastSyncedAt: timestamp('last_synced_at'),
  syncError: text('sync_error'),
});

// 8. orders
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderRef: text('order_ref').notNull().unique(), // e.g. 'KSG-20261118-A4B9'
  idempotencyKey: text('idempotency_key').notNull().unique(),
  userId: integer('user_id')
    .references(() => profiles.id)
    .notNull(),
  cashierId: integer('cashier_id').references(() => profiles.id),
  orderChannel: text('order_channel').notNull().default('online'), // 'online' | 'cashier_pos'
  customerDisplayName: text('customer_display_name'),
  customerDisplayPhone: text('customer_display_phone'),
  status: text('status').notNull().default('pending_payment'),
  // 'pending_payment' | 'payment_verifying' | 'paid' | 'processing' | 'delivered' | 'failed' | 'cancelled' | 'refunded'
  currency: text('currency').notNull().default('HTG'), // 'USD' | 'HTG'
  exchangeRateUsed: numeric('exchange_rate_used', { precision: 12, scale: 4 }).notNull(),
  subtotalUsd: numeric('subtotal_usd', { precision: 12, scale: 2 }).notNull(),
  discountUsd: numeric('discount_usd', { precision: 12, scale: 2 }).notNull().default('0.00'),
  paymentFeeUsd: numeric('payment_fee_usd', { precision: 12, scale: 2 }).notNull().default('0.00'),
  totalUsd: numeric('total_usd', { precision: 12, scale: 2 }).notNull(),
  totalHtg: numeric('total_htg', { precision: 12, scale: 2 }).notNull(),
  supplierCostUsd: numeric('supplier_cost_usd', { precision: 12, scale: 2 }).notNull().default('0.00'),
  estimatedProfitUsd: numeric('estimated_profit_usd', { precision: 12, scale: 2 }).notNull().default('0.00'),
  paymentMethod: text('payment_method').notNull(), // 'moncash' | 'natcash' | 'cash'
  couponCode: text('coupon_code'),
  playerId: text('player_id'),
  playerIdConfirmed: text('player_id_confirmed'),
  deliveryPayload: jsonb('delivery_payload').$type<{
    mode?: string;
    codeOrReceipt?: string;
    notes?: string;
    deliveredAt?: string;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 9. order_items
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  variantId: integer('variant_id')
    .references(() => productVariants.id)
    .notNull(),
  productName: text('product_name').notNull(),
  variantLabel: text('variant_label').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPriceUsd: numeric('unit_price_usd', { precision: 12, scale: 2 }).notNull(),
  supplierCostUsd: numeric('supplier_cost_usd', { precision: 12, scale: 2 }).notNull(),
  regionCode: text('region_code').notNull(),
});

// 10. payments
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => profiles.id)
    .notNull(),
  method: text('method').notNull(), // 'moncash' | 'natcash'
  merchantNumber: text('merchant_number').notNull(),
  transactionRef: text('transaction_ref').notNull().unique(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  status: text('status').notNull().default('verifying'), // 'pending' | 'verifying' | 'verified' | 'rejected' | 'refunded'
  verificationMode: text('verification_mode').notNull().default('manual_admin'), // 'auto_api' | 'manual_admin'
  verifiedBy: integer('verified_by').references(() => profiles.id),
  verifiedAt: timestamp('verified_at'),
  rejectionReason: text('rejection_reason'),
  webhookPayload: jsonb('webhook_payload'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 11. supplier_transactions
export const supplierTransactions = pgTable('supplier_transactions', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  externalOrderRef: text('external_order_ref'),
  requestPayload: jsonb('request_payload'),
  responsePayload: jsonb('response_payload'),
  status: text('status').notNull().default('pending'), // 'pending' | 'sent' | 'confirmed' | 'failed' | 'manual_fallback'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 12. exchange_rates
export const exchangeRates = pgTable('exchange_rates', {
  id: serial('id').primaryKey(),
  baseCurrency: text('base_currency').notNull().default('USD'),
  targetCurrency: text('target_currency').notNull().default('HTG'),
  rate: numeric('rate', { precision: 12, scale: 4 }).notNull(),
  updatedBy: integer('updated_by').references(() => profiles.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 13. refunds
export const refunds = pgTable('refunds', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  paymentId: integer('payment_id').references(() => payments.id),
  userId: integer('user_id')
    .references(() => profiles.id)
    .notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('requested'), // 'requested' | 'approved' | 'processed' | 'rejected'
  processedBy: integer('processed_by').references(() => profiles.id),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 14. promotions
export const promotions = pgTable('promotions', {
  id: serial('id').primaryKey(),
  titleFr: text('title_fr').notNull(),
  titleEs: text('title_es').notNull(),
  titleEn: text('title_en').notNull(),
  descriptionFr: text('description_fr').notNull(),
  descriptionEs: text('description_es').notNull(),
  descriptionEn: text('description_en').notNull(),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull(),
  productId: integer('product_id').references(() => products.id),
  startsAt: timestamp('starts_at').defaultNow().notNull(),
  endsAt: timestamp('ends_at'),
  isActive: boolean('is_active').notNull().default(true),
});

// 15. coupons
export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  discountType: text('discount_type').notNull().default('percent'), // 'percent' | 'fixed_usd'
  discountValue: numeric('discount_value', { precision: 12, scale: 2 }).notNull(),
  minOrderUsd: numeric('min_order_usd', { precision: 12, scale: 2 }).notNull().default('0.00'),
  maxUses: integer('max_uses').notNull().default(100),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').notNull().default(true),
});

// 16. notifications
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => profiles.id)
    .notNull(),
  orderId: integer('order_id').references(() => orders.id),
  eventType: text('event_type').notNull(),
  channel: text('channel').notNull().default('in_app'), // 'in_app' | 'email' | 'whatsapp'
  title: text('title').notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  deliveryStatus: text('delivery_status').notNull().default('delivered'), // 'delivered' | 'queued' | 'not_configured'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 17. support_tickets
export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  ticketRef: text('ticket_ref').notNull().unique(),
  userId: integer('user_id')
    .references(() => profiles.id)
    .notNull(),
  orderId: integer('order_id').references(() => orders.id),
  subject: text('subject').notNull(),
  category: text('category').notNull().default('general'), // 'payment' | 'delivery' | 'dls' | 'refund' | 'general'
  message: text('message').notNull(),
  status: text('status').notNull().default('open'), // 'open' | 'in_progress' | 'resolved' | 'closed'
  adminReply: text('admin_reply'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 18. audit_logs
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorId: integer('actor_id').references(() => profiles.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  details: jsonb('details'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 19. system_settings
export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  isSecret: boolean('is_secret').notNull().default(false),
  description: text('description').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const rolesRelations = relations(roles, ({ many }) => ({
  profiles: many(profiles),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  role: one(roles, {
    fields: [profiles.roleId],
    references: [roles.id],
  }),
  orders: many(orders),
  payments: many(payments),
  notifications: many(notifications),
  supportTickets: many(supportTickets),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
  supplierProducts: many(supplierProducts),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  supplierProducts: many(supplierProducts),
  transactions: many(supplierTransactions),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(profiles, {
    fields: [orders.userId],
    references: [profiles.id],
  }),
  items: many(orderItems),
  payments: many(payments),
  supplierTransactions: many(supplierTransactions),
  refunds: many(refunds),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
}));
