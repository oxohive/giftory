import { z } from 'zod'
import { toMinorUnits } from '@/lib/money'
import { ApiError, bffRequest } from './http'

/**
 * Server-side cart (backend `storefront` module, GAP G2 closed). The cart is keyed by the httpOnly
 * `sf_cart_token` cookie (anonymous) or by the signed-in customer; the BFF proxy forwards and relays
 * that cookie. Every response re-prices the lines from the catalog, so the totals returned here are
 * authoritative (the UI never computes prices itself, except for short-lived optimistic updates).
 *   GET    /api/storefront/cart                 -> { cart }
 *   PUT    /api/storefront/cart  { lines }      -> { cart }   (replace all lines, max 50)
 *   DELETE /api/storefront/cart                 -> { cart }   (empty)
 *   POST   /api/storefront/cart/lines  line     -> { cart }   (merges into an identical product/variant/gift line)
 *   PUT    /api/storefront/cart/lines/{id}      -> { cart }   ({ quantity?, giftWrap?, giftMessage? })
 *   DELETE /api/storefront/cart/lines/{id}      -> { cart }
 * Amounts are decimal major units on the wire and integer minor units in the UI. An anonymous cart
 * is merged into the customer's cart on the first cart call after login.
 * Validation errors: 422 { code: 'cart_invalid', details: [{ index, productId, variantId, code, maxLength? }] }.
 */

export const MAX_LINE_QUANTITY = 20

/** Line as sent to the backend (no prices: the server prices every line). */
export type CartLineInput = {
  productId: string
  variantId: string | null
  quantity: number
  giftWrap: boolean
  giftMessage: string | null
}

export type CartLinePatch = { quantity?: number; giftWrap?: boolean; giftMessage?: string | null }

/* ------------------------------------------------------------------------------------------ */
/* Wire schema                                                                                 */
/* ------------------------------------------------------------------------------------------ */

const decimal = z.union([z.number(), z.string()]).nullable()

export const serverCartSchema = z
  .object({
    id: z.string().nullable(),
    currencyCode: z.string(),
    lines: z.array(
      z
        .object({
          id: z.string(),
          key: z.string(),
          productId: z.string(),
          variantId: z.string().nullable(),
          slug: z.string(),
          title: z.string().nullable(),
          variantName: z.string().nullable(),
          sku: z.string().nullable(),
          imageUrl: z.string().nullable(),
          quantity: z.number().int(),
          maxQuantity: z.number().int().nullable(),
          currencyCode: z.string(),
          unitPriceGross: decimal,
          totalGross: decimal,
          gift: z.object({ giftWrap: z.boolean(), giftMessage: z.string().nullable() }),
          isCustomizable: z.boolean(),
          available: z.boolean(),
          /** e.g. product_unavailable, price_unavailable, gift_message_too_long */
          issue: z.string().nullable(),
        })
        .passthrough(),
    ),
    totals: z
      .object({ subtotal: z.union([z.number(), z.string()]), tax: z.union([z.number(), z.string()]), itemCount: z.number().int() })
      .passthrough(),
    hasIssues: z.boolean(),
    updatedAt: z.string().nullable().optional(),
  })
  .passthrough()
export type ServerCart = z.infer<typeof serverCartSchema>

const cartEnvelope = z.object({ cart: serverCartSchema })

/* ------------------------------------------------------------------------------------------ */
/* Domain types                                                                                */
/* ------------------------------------------------------------------------------------------ */

export type CartLine = {
  id: string
  key: string
  productId: string
  variantId: string | null
  slug: string
  title: string
  variantName: string | null
  imageUrl: string | null
  quantity: number
  maxQuantity: number
  currency: string
  /** Server price (gross, minor units); null when the line can't be priced. */
  unitPriceMinor: number | null
  totalMinor: number | null
  gift: { giftWrap: boolean; giftMessage: string }
  isCustomizable: boolean
  available: boolean
  issue: string | null
  /** True while an optimistic change has not been confirmed by the server yet. */
  pending: boolean
}

export type Cart = {
  id: string | null
  currency: string
  lines: CartLine[]
  subtotalMinor: number
  taxMinor: number
  itemCount: number
  hasIssues: boolean
  updatedAt: string | null
}

export const EMPTY_CART: Cart = {
  id: null,
  currency: 'INR',
  lines: [],
  subtotalMinor: 0,
  taxMinor: 0,
  itemCount: 0,
  hasIssues: false,
  updatedAt: null,
}

export function toCart(server: ServerCart): Cart {
  return {
    id: server.id,
    currency: server.currencyCode,
    lines: server.lines.map((line) => ({
      id: line.id,
      key: line.key,
      productId: line.productId,
      variantId: line.variantId,
      slug: line.slug,
      title: line.title ?? 'Unavailable item',
      variantName: line.variantName,
      imageUrl: line.imageUrl,
      quantity: line.quantity,
      maxQuantity: Math.min(MAX_LINE_QUANTITY, line.maxQuantity ?? MAX_LINE_QUANTITY),
      currency: line.currencyCode,
      unitPriceMinor: toMinorUnits(line.unitPriceGross),
      totalMinor: toMinorUnits(line.totalGross),
      gift: { giftWrap: line.gift.giftWrap, giftMessage: line.gift.giftMessage ?? '' },
      isCustomizable: line.isCustomizable,
      available: line.available,
      issue: line.issue,
      pending: false,
    })),
    subtotalMinor: toMinorUnits(server.totals.subtotal) ?? 0,
    taxMinor: toMinorUnits(server.totals.tax) ?? 0,
    itemCount: server.totals.itemCount,
    hasIssues: server.hasIssues,
    updatedAt: server.updatedAt ?? null,
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Validation errors                                                                           */
/* ------------------------------------------------------------------------------------------ */

const lineIssueSchema = z
  .object({
    index: z.number().int().optional(),
    productId: z.string().optional(),
    variantId: z.string().nullable().optional(),
    code: z.string(),
    maxLength: z.number().int().optional(),
  })
  .passthrough()
export type CartLineIssue = z.infer<typeof lineIssueSchema>

const issueEnvelope = z.object({ code: z.string().optional(), details: z.array(lineIssueSchema).optional() }).passthrough()

/** Shopper-facing text for a line issue code (cart responses and `cart_invalid` details). */
export function describeLineIssue(code: string, maxLength?: number): string {
  switch (code) {
    case 'product_unavailable':
      return 'This item is no longer available.'
    case 'variant_unavailable':
      return 'The selected option is no longer available.'
    case 'variant_required':
      return 'Please choose an option for this item.'
    case 'quote_only':
      return 'This item is available on request only.'
    case 'price_unavailable':
      return 'This item can’t be priced right now.'
    case 'quantity_below_minimum':
      return 'The quantity is below the minimum for this item.'
    case 'quantity_above_maximum':
      return 'The quantity is above the maximum for this item.'
    case 'quantity_increment':
      return 'This item is sold in fixed pack sizes. Please adjust the quantity.'
    case 'gift_wrap_unavailable':
      return 'Gift wrap isn’t available for this item.'
    case 'gift_message_not_allowed':
      return 'Gift messages aren’t available for this item.'
    case 'gift_message_too_long':
      return maxLength ? `The gift message is too long (maximum ${maxLength} characters).` : 'The gift message is too long.'
    default:
      return 'This item can’t be bought as selected.'
  }
}

/** Facade error code of an ApiError (`{ error, code, details? }`), if any. */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const parsed = issueEnvelope.safeParse(error.details)
  return parsed.success ? (parsed.data.code ?? null) : null
}

/** Line issues of a `422 cart_invalid` error (empty for any other error). */
export function cartIssuesFromError(error: unknown): CartLineIssue[] {
  if (!(error instanceof ApiError)) return []
  const parsed = issueEnvelope.safeParse(error.details)
  if (!parsed.success || parsed.data.code !== 'cart_invalid') return []
  return parsed.data.details ?? []
}

/** Readable message for a failed cart call. */
export function cartErrorMessage(error: unknown): string {
  const issues = cartIssuesFromError(error)
  if (issues.length) return [...new Set(issues.map((issue) => describeLineIssue(issue.code, issue.maxLength)))].join(' ')
  const code = apiErrorCode(error)
  if (code === 'cart_line_limit') return 'Your cart is full. Remove an item before adding another.'
  if (code === 'not_found') return 'This item is no longer in your cart.'
  if (error instanceof ApiError && error.status === 429) return 'Too many cart updates. Please wait a moment and try again.'
  return error instanceof Error ? error.message : 'Your cart couldn’t be updated. Please try again.'
}

/** Network failures and 5xx: worth retrying later (as opposed to a validation error). */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  return error.code === 'network' || error.status === 0 || error.status === 429 || error.status >= 500
}

/* ------------------------------------------------------------------------------------------ */
/* Client                                                                                      */
/* ------------------------------------------------------------------------------------------ */

const unwrap = (res: z.infer<typeof cartEnvelope>) => toCart(res.cart)

export const cartApi = {
  get: () => bffRequest('storefront/cart', cartEnvelope).then(unwrap),
  replace: (lines: CartLineInput[]) =>
    bffRequest('storefront/cart', cartEnvelope, { method: 'PUT', body: { lines } }).then(unwrap),
  clear: () => bffRequest('storefront/cart', cartEnvelope, { method: 'DELETE' }).then(unwrap),
  addLine: (line: CartLineInput) =>
    bffRequest('storefront/cart/lines', cartEnvelope, { method: 'POST', body: line }).then(unwrap),
  updateLine: (lineId: string, patch: CartLinePatch) =>
    bffRequest(`storefront/cart/lines/${encodeURIComponent(lineId)}`, cartEnvelope, { method: 'PUT', body: patch }).then(unwrap),
  removeLine: (lineId: string) =>
    bffRequest(`storefront/cart/lines/${encodeURIComponent(lineId)}`, cartEnvelope, { method: 'DELETE' }).then(unwrap),
}

/* ------------------------------------------------------------------------------------------ */
/* Legacy device cart (localStorage `sf.cart.v1`), read once to migrate it to the server cart. */
/* ------------------------------------------------------------------------------------------ */

export const LEGACY_CART_STORAGE_KEY = 'sf.cart.v1'

const legacyCartSchema = z.object({
  version: z.literal(1),
  lines: z.array(
    z
      .object({
        productId: z.string(),
        variantId: z.string().nullable().optional(),
        quantity: z.number().int().positive(),
        gift: z.object({ giftWrap: z.boolean(), giftMessage: z.string() }).partial().optional(),
      })
      .passthrough(),
  ),
})

/** Lines of the pre-server-cart localStorage cart, as backend inputs (empty when none). */
export function readLegacyCartLines(): CartLineInput[] {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(LEGACY_CART_STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const parsed = legacyCartSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return []
    return parsed.data.lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId ?? null,
      quantity: Math.max(1, Math.min(MAX_LINE_QUANTITY, line.quantity)),
      giftWrap: line.gift?.giftWrap === true,
      giftMessage: line.gift?.giftMessage?.trim() || null,
    }))
  } catch {
    return []
  }
}

export function clearLegacyCart() {
  try {
    window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY)
  } catch {
    // storage unavailable: nothing to clear
  }
}
