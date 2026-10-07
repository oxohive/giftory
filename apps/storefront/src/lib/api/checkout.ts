import { z } from 'zod'
import { toMinorUnits } from '@/lib/money'
import type { AddressInput } from './addresses'
import { ApiError, bffRequest, newIdempotencyKey } from './http'

/**
 * Checkout: shipping methods, order placement and payment-session creation, served by the backend
 * `storefront` module (GAP G3 closed; apps/mercato/src/modules/storefront):
 *   GET  /api/storefront/checkout/shipping-methods?subtotal=&itemCount=&postalCode=
 *        -> { items: [{ id, code, name, description, amount, currencyCode, estimatedTransitDays, carrierCode }] }
 *        Native sales shipping methods priced by the native sales calculator (uses the server cart when present).
 *   POST /api/storefront/checkout/orders            (Idempotency-Key header, 16-128 chars)
 *        `lines` is omitted, so the backend checks out the shopper's server-side cart (src/lib/api/cart.ts)
 *        and closes it once the order exists. Re-prices every line from the catalog, creates the native sales order (sales.orders.create),
 *        links the CRM customer, then calls paymentGatewayService.createPaymentSession and returns
 *        `payment` exactly as POST /api/payment_gateways/sessions does. Same key + same body = replay (200);
 *        same key + different body = 409 `idempotency_key_reused`.
 *   POST /api/storefront/orders/{id}/payment-session (Idempotency-Key)
 *        New payment session for an existing unpaid order (no duplicate order on payment retry).
 * The 404 fallbacks below only apply to backends without the storefront module.
 */

export type ShippingMethod = {
  code: string
  name: string
  description: string | null
  priceMinor: number
  /** True when the list is the storefront's static fallback (backend endpoint missing). */
  estimated: boolean
}

const shippingMethodWireSchema = z
  .object({
    id: z.string().optional(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    /** Major units (decimal), consistent with Open Mercato's sales module. */
    amount: z.union([z.number(), z.string()]),
    currencyCode: z.string().optional(),
  })
  .passthrough()

const FREE_SHIPPING_THRESHOLD_MINOR = 99_900

/** Static fallback used only while the facade endpoint is missing. Clearly labelled as an estimate in the UI. */
function fallbackShippingMethods(subtotalMinor: number): ShippingMethod[] {
  return [
    {
      code: 'standard',
      name: 'Standard delivery',
      description: '4–7 business days',
      priceMinor: subtotalMinor >= FREE_SHIPPING_THRESHOLD_MINOR ? 0 : 7_900,
      estimated: true,
    },
    { code: 'express', name: 'Express delivery', description: '1–3 business days', priceMinor: 14_900, estimated: true },
  ]
}

export type PaymentProvider = 'stripe' | 'razorpay'

/** Body of POST /checkout/orders. No `lines`: the backend checks out the server cart. */
export type PlaceOrderInput = {
  email: string
  shippingAddress: AddressInput
  billingSameAsShipping: boolean
  billingAddress: AddressInput | null
  shippingMethodCode: string
  paymentProvider: PaymentProvider
  /** Absolute storefront URLs; the backend passes them to the gateway as success/cancel URLs. */
  successUrl: string
  cancelUrl: string
}

/** Mirrors the response of POST /api/payment_gateways/sessions (payment_gateways/api/sessions/route.js). */
export const paymentSessionSchema = z
  .object({
    transactionId: z.string(),
    providerKey: z.string(),
    sessionId: z.string().nullable().optional(),
    clientSecret: z.string().nullable().optional(),
    redirectUrl: z.string().nullable().optional(),
    status: z.string().optional(),
    clientSession: z
      .object({
        type: z.string(),
        clientSecret: z.string().optional(),
        publishableKey: z.string().optional(),
        redirectUrl: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    /** gateway_razorpay: { razorpayOrderId, keyId, amountMinor, currency, ... } (Checkout.js input is in clientSession.payload) */
    providerData: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough()
export type PaymentSession = z.infer<typeof paymentSessionSchema>

const placeOrderResponseSchema = z
  .object({
    orderId: z.string(),
    orderNumber: z.string().nullable().optional(),
    currencyCode: z.string(),
    totals: z
      .object({
        subtotal: z.union([z.number(), z.string()]),
        shipping: z.union([z.number(), z.string()]).optional(),
        tax: z.union([z.number(), z.string()]).optional(),
        grandTotal: z.union([z.number(), z.string()]),
      })
      .passthrough(),
    payment: paymentSessionSchema,
  })
  .passthrough()

export type PlacedOrder = {
  orderId: string
  orderNumber: string | null
  currency: string
  grandTotalMinor: number
  payment: PaymentSession
}

export class CheckoutUnavailableError extends ApiError {
  constructor() {
    super(
      'Online checkout is not enabled on the backend yet (missing storefront checkout API). Your cart is saved — please try again later.',
      { status: 501, code: 'not_implemented' },
    )
  }
}

/** Route absent (proxy/backend 404/405/501). Errors from the storefront module carry a `code` and are real. */
function isMissingFacade(error: unknown): boolean {
  if (!(error instanceof ApiError) || !error.isMissingEndpoint) return false
  return typeof (error.details as { code?: unknown } | null | undefined)?.code !== 'string'
}

export const checkoutApi = {
  /** GET /api/storefront/checkout/shipping-methods?subtotal=&itemCount=&postalCode= */
  async shippingMethods(params: { subtotalMinor: number; itemCount?: number; postalCode?: string }): Promise<ShippingMethod[]> {
    try {
      const res = await bffRequest(
        'storefront/checkout/shipping-methods',
        z.object({ items: z.array(shippingMethodWireSchema) }),
        { query: { subtotal: params.subtotalMinor / 100, itemCount: params.itemCount, postalCode: params.postalCode } },
      )
      return res.items.map((m) => ({
        code: m.code,
        name: m.name,
        description: m.description ?? null,
        priceMinor: toMinorUnits(m.amount) ?? 0,
        estimated: false,
      }))
    } catch (error) {
      if (isMissingFacade(error)) return fallbackShippingMethods(params.subtotalMinor)
      throw error
    }
  },

  /**
   * POST /api/storefront/checkout/orders (Idempotency-Key header).
   * Creates the order for the signed-in customer (or a guest with `email`) and opens a payment
   * session with the chosen provider. Amounts are computed by the server, never the client.
   * `lines` is never sent: the backend checks out the shopper's server-side cart.
   */
  async placeOrder(input: PlaceOrderInput, idempotencyKey = newIdempotencyKey('order')): Promise<PlacedOrder> {
    try {
      const res = await bffRequest('storefront/checkout/orders', placeOrderResponseSchema, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: {
          ...input,
          currencyCode: 'INR',
          billingAddress: input.billingSameAsShipping ? input.shippingAddress : input.billingAddress,
        },
      })
      return {
        orderId: res.orderId,
        orderNumber: res.orderNumber ?? null,
        currency: res.currencyCode,
        grandTotalMinor: toMinorUnits(res.totals.grandTotal) ?? 0,
        payment: res.payment,
      }
    } catch (error) {
      if (isMissingFacade(error)) throw new CheckoutUnavailableError()
      throw error
    }
  },

  /**
   * POST /api/storefront/orders/{id}/payment-session (Idempotency-Key header).
   * Opens a fresh payment session for an unpaid order (e.g. after a cancelled Razorpay modal or a
   * declined card), instead of placing a second order. 409 `order_already_paid` once paid.
   */
  async retryPayment(
    orderId: string,
    input: { paymentProvider: PaymentProvider; successUrl: string; cancelUrl: string },
    idempotencyKey = newIdempotencyKey('pay'),
  ): Promise<PlacedOrder> {
    const res = await bffRequest(`storefront/orders/${encodeURIComponent(orderId)}/payment-session`, placeOrderResponseSchema, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: input,
    })
    return {
      orderId: res.orderId,
      orderNumber: res.orderNumber ?? null,
      currency: res.currencyCode,
      grandTotalMinor: toMinorUnits(res.totals.grandTotal) ?? 0,
      payment: res.payment,
    }
  },
}

const facadeErrorSchema = z
  .object({
    code: z.string().optional(),
    orderId: z.string().optional(),
    orderNumber: z.string().nullable().optional(),
  })
  .passthrough()

/** `code` of a storefront facade error (`{ error, code, details? }`), if any. */
export function checkoutErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const parsed = facadeErrorSchema.safeParse(error.details)
  return parsed.success ? (parsed.data.code ?? null) : null
}

/**
 * The order exists but its payment could not be opened (`payment_session_failed`) or is already
 * paid (`order_already_paid`): both carry the order id.
 */
export function orderFromCheckoutError(error: unknown): { code: string; orderId: string; orderNumber: string | null } | null {
  if (!(error instanceof ApiError)) return null
  const parsed = facadeErrorSchema.safeParse(error.details)
  if (!parsed.success || !parsed.data.orderId || !parsed.data.code) return null
  return { code: parsed.data.code, orderId: parsed.data.orderId, orderNumber: parsed.data.orderNumber ?? null }
}
