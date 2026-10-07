import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'

/**
 * Storefront-owned tables. Links to other modules (catalog products/variants,
 * sales orders, CRM people, customer accounts, gateway transactions) are scalar
 * UUID columns only: cross-module ORM relations are banned.
 *
 * Why a dedicated cart instead of a native `sales` quote: quotes are staff
 * documents. Each one consumes a quote number, fires staff notifications,
 * writes audit/undo history on every line change, shows up in the backoffice
 * quote list and carries quote statuses (sent/accepted). Anonymous, abandoned
 * shopper carts would flood all of that. The cart is a thin, re-priced list of
 * (variant, quantity, gift options); the native sales order is created only at
 * checkout, through `sales.orders.create`.
 */

/** A shopper cart, owned by an anonymous token (hash only) or a customer account. */
@Entity({ tableName: 'storefront_carts' })
@Unique({ name: 'storefront_carts_token_hash_uniq', properties: ['tenantId', 'organizationId', 'tokenHash'] })
@Index({ name: 'storefront_carts_customer_idx', properties: ['tenantId', 'organizationId', 'customerUserId', 'status'] })
export class StorefrontCart {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  /** SHA-256 of the anonymous cart cookie token; null once adopted by a customer. */
  @Property({ name: 'token_hash', type: 'text', nullable: true })
  tokenHash?: string | null

  /** `customer_accounts` customer user id (scalar link). */
  @Property({ name: 'customer_user_id', type: 'uuid', nullable: true })
  customerUserId?: string | null

  @Property({ name: 'currency_code', type: 'text' })
  currencyCode!: string

  /** `active` | `converted` | `merged` */
  @Property({ type: 'text', default: 'active' })
  status: string = 'active'

  /** `sales:sales_order` id once the cart was checked out (scalar link). */
  @Property({ name: 'converted_order_id', type: 'uuid', nullable: true })
  convertedOrderId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

/** One cart line: variant + quantity + gift options. Prices are never stored here. */
@Entity({ tableName: 'storefront_cart_lines' })
@Unique({ name: 'storefront_cart_lines_cart_key_uniq', properties: ['cartId', 'lineKey'] })
@Index({ name: 'storefront_cart_lines_scope_cart_idx', properties: ['tenantId', 'organizationId', 'cartId'] })
export class StorefrontCartLine {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'cart_id', type: 'uuid' })
  cartId!: string

  /** `catalog:catalog_product` id (scalar link). */
  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  /** `catalog:catalog_product_variant` id (scalar link). */
  @Property({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId?: string | null

  @Property({ type: 'integer' })
  quantity!: number

  @Property({ name: 'gift_wrap', type: 'boolean', default: false })
  giftWrap: boolean = false

  @Property({ name: 'gift_message', type: 'text', nullable: true })
  giftMessage?: string | null

  /** product:variant:wrap:sha256(message) — identical options merge into one line. */
  @Property({ name: 'line_key', type: 'text' })
  lineKey!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

/**
 * Order-placement ledger: one row per `Idempotency-Key` (or per payment retry).
 * Records the request hash, the created sales order, the gateway transaction
 * and the payment state mirrored from `payment_gateways` events.
 */
@Entity({ tableName: 'storefront_checkouts' })
@Unique({ name: 'storefront_checkouts_idempotency_uniq', properties: ['tenantId', 'organizationId', 'idempotencyKey'] })
@Index({ name: 'storefront_checkouts_customer_idx', properties: ['tenantId', 'organizationId', 'customerUserId'] })
@Index({ name: 'storefront_checkouts_order_idx', properties: ['tenantId', 'organizationId', 'orderId'] })
@Index({ name: 'storefront_checkouts_transaction_idx', properties: ['gatewayTransactionId'] })
export class StorefrontCheckout {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  /** `order` (POST /checkout/orders) | `payment_retry` (POST /orders/{id}/payment-session) */
  @Property({ type: 'text', default: 'order' })
  kind: string = 'order'

  @Property({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string

  @Property({ name: 'request_hash', type: 'text' })
  requestHash!: string

  /** `processing` | `order_created` | `completed` */
  @Property({ type: 'text', default: 'processing' })
  status: string = 'processing'

  @Property({ name: 'claimed_at', type: Date, nullable: true })
  claimedAt?: Date | null

  @Property({ name: 'customer_user_id', type: 'uuid', nullable: true })
  customerUserId?: string | null

  /** CRM person (`customers:customer_entity`) the order was linked to. */
  @Property({ name: 'customer_entity_id', type: 'uuid', nullable: true })
  customerEntityId?: string | null

  @Property({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ name: 'order_number', type: 'text', nullable: true })
  orderNumber?: string | null

  @Property({ name: 'currency_code', type: 'text' })
  currencyCode!: string

  @Property({ name: 'subtotal_amount', type: 'numeric', precision: 18, scale: 4, default: '0' })
  subtotalAmount: string = '0'

  @Property({ name: 'shipping_amount', type: 'numeric', precision: 18, scale: 4, default: '0' })
  shippingAmount: string = '0'

  @Property({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 4, default: '0' })
  taxAmount: string = '0'

  @Property({ name: 'grand_total_amount', type: 'numeric', precision: 18, scale: 4, default: '0' })
  grandTotalAmount: string = '0'

  @Property({ name: 'provider_key', type: 'text' })
  providerKey!: string

  /** `paymentId` handed to `paymentGatewayService` (stable across retries of this row). */
  @Property({ name: 'payment_id', type: 'uuid' })
  paymentId!: string

  /** `payment_gateways:gateway_transaction` id (scalar link). */
  @Property({ name: 'gateway_transaction_id', type: 'uuid', nullable: true })
  gatewayTransactionId?: string | null

  /** Unified gateway status mirrored by the payment subscribers. */
  @Property({ name: 'payment_status', type: 'text', default: 'pending' })
  paymentStatus: string = 'pending'

  /** `sales:sales_payment` recorded when money was taken (scalar link). */
  @Property({ name: 'sales_payment_id', type: 'uuid', nullable: true })
  salesPaymentId?: string | null

  /** Claim marker that serializes sales-payment creation across event retries. */
  @Property({ name: 'payment_recorded_at', type: Date, nullable: true })
  paymentRecordedAt?: Date | null

  @Property({ name: 'guest_access_token_hash', type: 'text', nullable: true })
  guestAccessTokenHash?: string | null

  @Property({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

/** Customer account → CRM person link maintained by the storefront (G8). */
@Entity({ tableName: 'storefront_customer_links' })
@Unique({ name: 'storefront_customer_links_user_uniq', properties: ['tenantId', 'organizationId', 'customerUserId'] })
@Index({ name: 'storefront_customer_links_person_idx', properties: ['tenantId', 'organizationId', 'personEntityId'] })
export class StorefrontCustomerLink {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'customer_user_id', type: 'uuid' })
  customerUserId!: string

  @Property({ name: 'person_entity_id', type: 'uuid' })
  personEntityId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

/**
 * Shopper address book (G4). Kept apart from CRM addresses on purpose: gift
 * delivery addresses are mostly the *recipients'* addresses (with a contact
 * phone for the courier), not addresses of the customer record itself.
 */
@Entity({ tableName: 'storefront_addresses' })
@Index({ name: 'storefront_addresses_customer_idx', properties: ['tenantId', 'organizationId', 'customerUserId', 'deletedAt'] })
export class StorefrontAddress {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'customer_user_id', type: 'uuid' })
  customerUserId!: string

  @Property({ name: 'full_name', type: 'text' })
  fullName!: string

  @Property({ type: 'text' })
  phone!: string

  @Property({ type: 'text' })
  line1!: string

  @Property({ type: 'text', nullable: true })
  line2?: string | null

  @Property({ type: 'text' })
  city!: string

  @Property({ type: 'text' })
  state!: string

  @Property({ name: 'postal_code', type: 'text' })
  postalCode!: string

  @Property({ type: 'text', default: 'IN' })
  country: string = 'IN'

  @Property({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean = false

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
