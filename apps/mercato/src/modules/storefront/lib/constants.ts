/**
 * Stable constants of the shopper-facing `storefront` facade.
 *
 * Cookie names, error codes and payment-provider keys are part of the public
 * storefront contract (see apps/storefront/docs/backend-api-contract.md §5):
 * add new values, never rename existing ones.
 */

/** The storefront sells in INR only (Phase 1). */
export const STOREFRONT_CURRENCY = 'INR' as const

/** Catalog price kind used for public list prices (`catalog_price_kinds.code`). */
export const STOREFRONT_PRICE_KIND_CODE = 'regular' as const

/** Anonymous cart token cookie (httpOnly). The DB only stores its SHA-256 hash. */
export const CART_COOKIE = 'sf_cart_token' as const
export const CART_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/**
 * Guest order access cookie: a short list of `{orderId, token}` pairs that lets
 * a guest read the orders they just placed (confirmation page). Only hashes of
 * the tokens are stored server-side.
 */
export const ORDER_ACCESS_COOKIE = 'sf_order_access' as const
export const ORDER_ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
export const ORDER_ACCESS_MAX_ENTRIES = 10

export const MAX_CART_LINES = 50
/** Mirrors the storefront's `MAX_LINE_QUANTITY` (src/lib/api/cart.ts). */
export const MAX_LINE_QUANTITY = 20
/** Hard cap independent of gift profiles (gift_catalog `MAX_GIFT_MESSAGE_LENGTH`). */
export const GIFT_MESSAGE_HARD_LIMIT = 2000

export const PAYMENT_PROVIDERS = ['stripe', 'razorpay'] as const
export type StorefrontPaymentProvider = (typeof PAYMENT_PROVIDERS)[number]

/** A `processing` checkout claim older than this may be reclaimed by a retry. */
export const CHECKOUT_CLAIM_STALE_MS = 2 * 60 * 1000

/** Order `externalReference` prefix that ties a sales order to its checkout ledger row. */
export const ORDER_EXTERNAL_REFERENCE_PREFIX = 'storefront:' as const
export const ORDER_SOURCE = 'storefront' as const

/**
 * Sales dictionary values (seeded by the sales module, `lib/dictionaries`).
 * Payment status follows the gateway transaction status; the order moves to
 * `confirmed` once money is authorized or captured.
 */
export const SALES_PAYMENT_STATUS_BY_UNIFIED: Record<string, string> = {
  pending: 'pending',
  authorized: 'authorized',
  captured: 'captured',
  partially_captured: 'captured',
  partially_refunded: 'captured',
  refunded: 'refunded',
  failed: 'failed',
  cancelled: 'canceled',
  expired: 'canceled',
}
export const ORDER_STATUS_WHEN_PAID = 'confirmed' as const
export const SALES_PAYMENT_STATUS_DICTIONARY_KEY = 'sales.payment_status' as const
export const SALES_ORDER_STATUS_DICTIONARY_KEY = 'sales.order_status' as const

/** Unified gateway statuses that mean money was taken (a sales payment is recorded). */
export const MONEY_TAKEN_STATUSES = new Set(['captured', 'partially_captured', 'partially_refunded', 'refunded'])

export const CHECKOUT_KIND_ORDER = 'order' as const
export const CHECKOUT_KIND_PAYMENT_RETRY = 'payment_retry' as const

export const CHECKOUT_STATUS = {
  processing: 'processing',
  orderCreated: 'order_created',
  completed: 'completed',
} as const

export const CART_STATUS = {
  active: 'active',
  converted: 'converted',
  merged: 'merged',
} as const

/** Stable error codes returned in `{ error, code }` bodies. */
export const STOREFRONT_ERROR_CODES = [
  'shop_required',
  'shop_not_found',
  'invalid_request',
  'authentication_required',
  'not_found',
  'order_not_found',
  'cart_empty',
  'cart_invalid',
  'cart_line_limit',
  'shipping_method_unavailable',
  'return_url_not_allowed',
  'idempotency_key_required',
  'idempotency_key_reused',
  'checkout_in_progress',
  'order_already_paid',
  'payment_session_failed',
  'internal_error',
] as const
export type StorefrontErrorCode = (typeof STOREFRONT_ERROR_CODES)[number]

/** Per-line pricing/validation issue codes (cart view + order placement). */
export const LINE_ISSUE_CODES = [
  'product_unavailable',
  'variant_unavailable',
  'variant_required',
  'quote_only',
  'price_unavailable',
  'quantity_below_minimum',
  'quantity_above_maximum',
  'quantity_increment',
  'gift_wrap_unavailable',
  'gift_message_not_allowed',
  'gift_message_too_long',
] as const
export type LineIssueCode = (typeof LINE_ISSUE_CODES)[number]

export const STOREFRONT_ADDRESS_CREATE_COMMAND = 'storefront.addresses.create' as const
export const STOREFRONT_ADDRESS_UPDATE_COMMAND = 'storefront.addresses.update' as const
export const STOREFRONT_ADDRESS_DELETE_COMMAND = 'storefront.addresses.delete' as const
