import { z } from 'zod'
import { publicEnv } from '@/lib/env.public'
import { siteConfig } from '@/lib/site'
import type { PaymentSession } from './checkout'
import { bffRequest, newIdempotencyKey } from './http'

/**
 * Payment helpers for the two gateways.
 *
 * Stripe (`@open-mercato/gateway-stripe`, providerKey "stripe"): the session is a PaymentIntent.
 * The adapter returns `clientSecret` and `clientSession: { type: 'embedded', clientSecret, publishableKey }`
 * (gateway-stripe/dist/modules/gateway_stripe/lib/adapters/v2025-02-24.acacia.js#createSession),
 * which is exactly what the Stripe Payment Element needs. Webhooks
 * (/api/payment_gateways/webhook/stripe) settle the transaction server-side.
 *
 * Razorpay (`gateway_razorpay`, providerKey "razorpay"): the session returns
 * `clientSession: { type: 'embedded', rendererKey: 'razorpay.checkout', payload: { keyId, orderId, amount, currency } }`
 * for Checkout.js. After the modal succeeds the storefront posts the three razorpay_* fields to
 * POST /api/gateway_razorpay/confirm, which verifies the signature and syncs the transaction; the
 * backend `storefront` module then moves the order's payment status (payment_gateways events).
 */

export type StripeClientConfig = { clientSecret: string; publishableKey: string }

export function stripeConfigFromSession(session: PaymentSession): StripeClientConfig | null {
  const clientSecret = session.clientSession?.clientSecret ?? session.clientSecret ?? null
  const publishableKey = session.clientSession?.publishableKey ?? publicEnv.stripePublishableKey
  if (!clientSecret || !publishableKey) return null
  return { clientSecret, publishableKey }
}

const razorpayCheckoutSchema = z
  .object({
    keyId: z.string().optional(),
    orderId: z.string(),
    amount: z.number().int().positive(),
    currency: z.string(),
  })
  .passthrough()

export type RazorpayClientConfig = { keyId: string; orderId: string; amount: number; currency: string }

/**
 * gateway_razorpay returns the Checkout.js input in `clientSession.payload`
 * (`{ keyId, orderId, amount (paise), currency }`, see gateway_razorpay/lib/adapter.ts) and the
 * same data in `providerData` as `{ keyId, razorpayOrderId, amountMinor, currency }`.
 */
export function razorpayConfigFromSession(session: PaymentSession): RazorpayClientConfig | null {
  const clientSession = (session.clientSession ?? null) as Record<string, unknown> | null
  const payload = clientSession && typeof clientSession.payload === 'object' ? (clientSession.payload as Record<string, unknown>) : null
  const providerData = (session.providerData ?? {}) as Record<string, unknown>
  const candidate = payload ?? {
    keyId: providerData.keyId,
    orderId: providerData.razorpayOrderId ?? providerData.orderId,
    amount: providerData.amountMinor ?? providerData.amount,
    currency: providerData.currency,
  }
  const parsed = razorpayCheckoutSchema.safeParse(candidate)
  if (!parsed.success) return null
  const keyId = parsed.data.keyId ?? publicEnv.razorpayKeyId
  if (!keyId) return null
  return { keyId, orderId: parsed.data.orderId, amount: parsed.data.amount, currency: parsed.data.currency }
}

export type RazorpaySuccess = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

type RazorpayOptions = {
  key: string
  order_id: string
  amount: number
  currency: string
  name: string
  description?: string
  prefill?: { name?: string; email?: string; contact?: string }
  notes?: Record<string, string>
  theme?: { color?: string }
  handler: (response: RazorpaySuccess) => void
  modal?: { ondismiss?: () => void; escape?: boolean }
}

type RazorpayInstance = {
  open: () => void
  on: (event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
  }
}

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'
let razorpayScriptPromise: Promise<void> | null = null

/** Loads Razorpay Checkout.js on demand (only on the checkout page, only when Razorpay is chosen). */
export function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Razorpay can only load in the browser'))
  if (window.Razorpay) return Promise.resolve()
  if (razorpayScriptPromise) return razorpayScriptPromise
  razorpayScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = RAZORPAY_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      razorpayScriptPromise = null
      reject(new Error('Could not load Razorpay Checkout. Check your connection or try another payment method.'))
    }
    document.body.appendChild(script)
  })
  return razorpayScriptPromise
}

export function openRazorpayCheckout(
  config: RazorpayClientConfig,
  details: { orderLabel: string; email?: string; name?: string; contact?: string },
): Promise<RazorpaySuccess> {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Razorpay Checkout is not loaded'))
      return
    }
    const instance = new window.Razorpay({
      key: config.keyId,
      order_id: config.orderId,
      amount: config.amount,
      currency: config.currency,
      name: siteConfig.name,
      description: details.orderLabel,
      prefill: { name: details.name, email: details.email, contact: details.contact },
      theme: { color: '#c2410c' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(new Error('Payment was cancelled.')), escape: true },
    })
    instance.on('payment.failed', (response) => {
      reject(new Error(response.error?.description ?? 'Payment failed. Please try again.'))
    })
    instance.open()
  })
}

const confirmResponseSchema = z
  .object({ ok: z.boolean().optional(), status: z.string().optional() })
  .passthrough()

export const paymentsApi = {
  /**
   * POST /api/gateway_razorpay/confirm (gateway_razorpay/api/confirm/route.ts)
   * Body: { razorpay_payment_id, razorpay_order_id, razorpay_signature } (`transactionId` is ignored).
   * Responds `{ transactionId, paymentId, status, synced }` (200, or 202 when the status sync is deferred
   * to webhooks). The backend verifies HMAC-SHA256(order_id|payment_id, key_secret) — never the browser.
   */
  confirmRazorpay: (transactionId: string, result: RazorpaySuccess) =>
    bffRequest('gateway_razorpay/confirm', confirmResponseSchema, {
      method: 'POST',
      headers: { 'Idempotency-Key': newIdempotencyKey('rzp') },
      body: { transactionId, ...result },
    }),
}
