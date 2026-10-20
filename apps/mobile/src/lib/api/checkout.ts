import { z } from 'zod'
import { apiRequest } from './http'

/**
 * Checkout — `apps/mercato`'s `storefront` module checkout routes, called directly (guest-allowed):
 *
 *   GET  /api/storefront/checkout/shipping-methods?subtotal=&itemCount=&postalCode=
 *        -> { items: [{ id, code, name, amount, currencyCode, estimatedTransitDays, carrierCode }] }
 *   POST /api/storefront/checkout/orders            (header `Idempotency-Key`, 16-128 chars, required)
 *        Checks out the current server cart (no `lines` in the body). Response 201:
 *        { orderId, orderNumber, currencyCode, totals{...}, payment{...} }. Same key + same body
 *        replays the order (200); same key + different body -> 409 { code: 'idempotency_key_reused' }.
 *   POST /api/storefront/orders/{id}/payment-session (same Idempotency-Key requirement)
 *        Retries payment on an unpaid order without duplicating it. Same response shape.
 *
 * `totals` and `payment` wire field names are cross-checked against
 * `apps/storefront/src/lib/api/checkout.ts`'s `placeOrderResponseSchema` / `paymentSessionSchema`.
 * Both `ApiError` codes above (`cart_invalid` on the preceding cart call and
 * `idempotency_key_reused` here) are left to propagate as a thrown `ApiError` from `apiRequest` —
 * this module performs no catch/swallow.
 */

export interface Address {
  fullName: string
  phone: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface ShippingMethod {
  id: string
  code: string
  name: string
  amountMajor: number
  currencyCode: string
  estimatedTransitDays: number
  carrierCode?: string
}

export interface PaymentSession {
  transactionId: string
  sessionId: string
  providerKey: 'razorpay'
  clientSecret?: string
  redirectUrl?: string
  providerData?: Record<string, unknown>
  clientSession?: Record<string, unknown>
  status: string
  paymentId?: string
}

export interface PlacedOrder {
  orderId: string
  orderNumber: string
  currencyCode: string
  totals: { subtotalMajor: number; shippingMajor: number; taxMajor: number; grandTotalMajor: number }
  payment: PaymentSession
}

export interface PlaceOrderInput {
  email: string
  currencyCode: 'INR'
  shippingAddress: Address
  billingAddress?: Address
  billingSameAsShipping: boolean
  shippingMethodCode: string
  paymentProvider: 'razorpay'
  successUrl: string
  cancelUrl: string
}

/* ------------------------------------------------------------------------------------------ */
/* Wire schemas                                                                                */
/* ------------------------------------------------------------------------------------------ */

const decimal = z.union([z.number(), z.string()]).nullable().optional()

function numberOf(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

const shippingMethodWireSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    amount: z.union([z.number(), z.string()]),
    currencyCode: z.string().nullable().optional(),
    estimatedTransitDays: z.number().nullable().optional(),
    carrierCode: z.string().nullable().optional(),
  })
  .passthrough()

const shippingMethodsWireSchema = z.object({ items: z.array(shippingMethodWireSchema) }).passthrough()

const paymentSessionWireSchema = z
  .object({
    transactionId: z.string(),
    sessionId: z.string().nullable().optional(),
    providerKey: z.string().optional(),
    clientSecret: z.string().nullable().optional(),
    redirectUrl: z.string().nullable().optional(),
    providerData: z.record(z.string(), z.unknown()).nullable().optional(),
    clientSession: z.record(z.string(), z.unknown()).nullable().optional(),
    status: z.string().optional(),
    paymentId: z.string().nullable().optional(),
  })
  .passthrough()

const placedOrderWireSchema = z
  .object({
    orderId: z.string(),
    orderNumber: z.string().nullable().optional(),
    currencyCode: z.string(),
    totals: z
      .object({
        subtotal: decimal,
        shipping: decimal,
        tax: decimal,
        grandTotal: decimal,
      })
      .passthrough(),
    payment: paymentSessionWireSchema,
  })
  .passthrough()

function toPlacedOrder(wire: z.infer<typeof placedOrderWireSchema>): PlacedOrder {
  return {
    orderId: wire.orderId,
    orderNumber: wire.orderNumber ?? '',
    currencyCode: wire.currencyCode,
    totals: {
      subtotalMajor: numberOf(wire.totals.subtotal),
      shippingMajor: numberOf(wire.totals.shipping),
      taxMajor: numberOf(wire.totals.tax),
      grandTotalMajor: numberOf(wire.totals.grandTotal),
    },
    payment: {
      transactionId: wire.payment.transactionId,
      sessionId: wire.payment.sessionId ?? '',
      providerKey: 'razorpay',
      clientSecret: wire.payment.clientSecret ?? undefined,
      redirectUrl: wire.payment.redirectUrl ?? undefined,
      providerData: wire.payment.providerData ?? undefined,
      clientSession: wire.payment.clientSession ?? undefined,
      status: wire.payment.status ?? '',
      paymentId: wire.payment.paymentId ?? undefined,
    },
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Client                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export async function getShippingMethods(params: {
  subtotalMajor: number
  itemCount: number
  postalCode?: string
}): Promise<ShippingMethod[]> {
  const res = await apiRequest('/api/storefront/checkout/shipping-methods', shippingMethodsWireSchema, {
    query: { subtotal: params.subtotalMajor, itemCount: params.itemCount, postalCode: params.postalCode },
  })
  return res.items.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    amountMajor: numberOf(m.amount),
    currencyCode: m.currencyCode ?? 'INR',
    estimatedTransitDays: m.estimatedTransitDays ?? 0,
    carrierCode: m.carrierCode ?? undefined,
  }))
}

/** `lines` is never sent: the backend checks out the shopper's server-side cart. */
export async function placeOrder(input: PlaceOrderInput, idempotencyKey: string): Promise<PlacedOrder> {
  const res = await apiRequest('/api/storefront/checkout/orders', placedOrderWireSchema, {
    method: 'POST',
    idempotencyKey,
    body: input,
  })
  return toPlacedOrder(res)
}

export async function openPaymentSession(
  orderId: string,
  input: { paymentProvider: 'razorpay'; successUrl: string; cancelUrl: string },
  idempotencyKey: string,
): Promise<PlacedOrder> {
  const res = await apiRequest(
    `/api/storefront/orders/${encodeURIComponent(orderId)}/payment-session`,
    placedOrderWireSchema,
    { method: 'POST', idempotencyKey, body: input },
  )
  return toPlacedOrder(res)
}
