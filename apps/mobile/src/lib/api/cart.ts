import { z } from 'zod'
import { apiRequest } from './http'

/**
 * Server-side cart — `apps/mercato`'s `storefront` module cart routes, called directly (guest-OK,
 * keyed by the backend's httpOnly `sf_cart_token` cookie that `fetch`'s native cookie jar relays
 * automatically — see TASK-03's `http.ts`):
 *
 *   GET    /api/storefront/cart                -> { cart }
 *   PUT    /api/storefront/cart  { lines }      -> { cart }   (replaces all lines, max 50)
 *   DELETE /api/storefront/cart                 -> { cart }   (empties the cart)
 *   POST   /api/storefront/cart/lines  line     -> { cart }   (merges into an identical product/
 *                                                             variant/giftWrap/giftMessage line)
 *   PUT    /api/storefront/cart/lines/{id}      -> { cart }   ({ quantity?, giftWrap?, giftMessage? })
 *   DELETE /api/storefront/cart/lines/{id}      -> { cart }
 *
 * Validation failures: 422 { error, code: 'cart_invalid', details: [...] } — this module never
 * catches/swallows these; they propagate as a thrown `ApiError` (from TASK-03's `http.ts`) with
 * `.code === 'cart_invalid'` so TASK-06 can render per-line issues.
 *
 * Wire field names for lines/totals are cross-checked against
 * `apps/storefront/src/lib/api/cart.ts`'s `serverCartSchema` (its own live-verified wire schema for
 * this same endpoint set).
 *
 * CONFIRMED DISCREPANCY (verified against the live route source, not just inference): the
 * TASK-04 contract's `CartLineIssue` has a `lineId` field, but the real `422 cart_invalid` details
 * shape — confirmed against `apps/mercato/src/modules/storefront/lib/cart.ts`'s `issuesError()` —
 * is genuinely `{ index, productId, variantId, code, maxLength? }`, with no `lineId` anywhere.
 * `CartLineIssue` is declared below exactly as specified in the contract (for TASK-06 to
 * reference), but no parsing/mapping function is provided for it here since the real wire shape
 * doesn't supply the field it names. TASK-06 correctly worked around this by defining its own
 * `RealCartLineIssue` type matching the confirmed shape and rendering a cart-wide banner instead
 * of guessing a per-line attribution — see `src/features/cart/lib/cartErrorMessage.ts`.
 */

export interface CartLineIssue {
  lineId: string
  code: string
  message: string
}

export interface CartLine {
  id: string
  productId: string
  variantId?: string
  quantity: number
  giftWrap?: boolean
  giftMessage?: string
  unitPriceMajor: number
  lineTotalMajor: number
}

export interface Cart {
  id: string
  currencyCode: string
  lines: CartLine[]
  totals: { subtotalMajor: number; taxMajor: number; itemCount: number }
  hasIssues: boolean
  updatedAt: string
}

export interface CartLineInput {
  productId: string
  variantId?: string
  quantity: number
  giftWrap?: boolean
  giftMessage?: string
}

/* ------------------------------------------------------------------------------------------ */
/* Wire schema                                                                                 */
/* ------------------------------------------------------------------------------------------ */

const decimal = z.union([z.number(), z.string()]).nullable().optional()

function numberOf(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

const cartLineWireSchema = z
  .object({
    id: z.string(),
    productId: z.string(),
    variantId: z.string().nullable().optional(),
    quantity: z.number().int(),
    gift: z
      .object({ giftWrap: z.boolean().optional(), giftMessage: z.string().nullable().optional() })
      .partial()
      .optional(),
    // Tolerate a flat shape too, in case the facade doesn't nest gift options.
    giftWrap: z.boolean().optional(),
    giftMessage: z.string().nullable().optional(),
    unitPriceGross: decimal,
    totalGross: decimal,
  })
  .passthrough()

const cartWireSchema = z
  .object({
    id: z.string().nullable(),
    currencyCode: z.string(),
    lines: z.array(cartLineWireSchema),
    totals: z
      .object({ subtotal: decimal, tax: decimal, itemCount: z.number().int() })
      .passthrough(),
    hasIssues: z.boolean(),
    updatedAt: z.string().nullable().optional(),
  })
  .passthrough()

const cartEnvelopeWireSchema = z.object({ cart: cartWireSchema }).passthrough()

function toCartLine(wire: z.infer<typeof cartLineWireSchema>): CartLine {
  return {
    id: wire.id,
    productId: wire.productId,
    variantId: wire.variantId ?? undefined,
    quantity: wire.quantity,
    giftWrap: wire.gift?.giftWrap ?? wire.giftWrap ?? undefined,
    giftMessage: wire.gift?.giftMessage ?? wire.giftMessage ?? undefined,
    unitPriceMajor: numberOf(wire.unitPriceGross),
    lineTotalMajor: numberOf(wire.totalGross),
  }
}

function toCart(wire: z.infer<typeof cartWireSchema>): Cart {
  return {
    id: wire.id ?? '',
    currencyCode: wire.currencyCode,
    lines: wire.lines.map(toCartLine),
    totals: {
      subtotalMajor: numberOf(wire.totals.subtotal),
      taxMajor: numberOf(wire.totals.tax),
      itemCount: wire.totals.itemCount,
    },
    hasIssues: wire.hasIssues,
    updatedAt: wire.updatedAt ?? '',
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Client                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export async function getCart(): Promise<Cart> {
  const res = await apiRequest('/api/storefront/cart', cartEnvelopeWireSchema)
  return toCart(res.cart)
}

/** Replaces all cart lines (max 50). */
export async function replaceCartLines(lines: CartLineInput[]): Promise<Cart> {
  const res = await apiRequest('/api/storefront/cart', cartEnvelopeWireSchema, {
    method: 'PUT',
    body: { lines },
  })
  return toCart(res.cart)
}

export async function clearCart(): Promise<void> {
  await apiRequest('/api/storefront/cart', cartEnvelopeWireSchema, { method: 'DELETE' })
}

/** Merges into an existing identical line (same product+variant+giftWrap+giftMessage). */
export async function addCartLine(input: CartLineInput): Promise<Cart> {
  const res = await apiRequest('/api/storefront/cart/lines', cartEnvelopeWireSchema, {
    method: 'POST',
    body: input,
  })
  return toCart(res.cart)
}

export async function updateCartLine(
  lineId: string,
  patch: { quantity?: number; giftWrap?: boolean; giftMessage?: string },
): Promise<Cart> {
  const res = await apiRequest(`/api/storefront/cart/lines/${encodeURIComponent(lineId)}`, cartEnvelopeWireSchema, {
    method: 'PUT',
    body: patch,
  })
  return toCart(res.cart)
}

export async function removeCartLine(lineId: string): Promise<Cart> {
  const res = await apiRequest(`/api/storefront/cart/lines/${encodeURIComponent(lineId)}`, cartEnvelopeWireSchema, {
    method: 'DELETE',
  })
  return toCart(res.cart)
}
