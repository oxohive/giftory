import type { UnifiedPaymentStatus } from '@open-mercato/shared/modules/payment_gateways/types'

/**
 * Razorpay payment entity statuses: created | authorized | captured | refunded | failed.
 * `failed` describes one *attempt*: Razorpay Checkout lets the customer retry on the same
 * order, so a failed attempt must not move the order-level transaction into the terminal
 * `failed` state (that would block a later successful capture). See RAZORPAY_EVENT_STATUS_MAP.
 */
const PAYMENT_STATUS_MAP: Record<string, UnifiedPaymentStatus> = {
  created: 'pending',
  authorized: 'authorized',
  captured: 'captured',
  refunded: 'refunded',
  failed: 'failed',
}

/** Razorpay order entity statuses: created | attempted | paid. */
const ORDER_STATUS_MAP: Record<string, UnifiedPaymentStatus> = {
  created: 'pending',
  attempted: 'pending',
  paid: 'captured',
}

export function mapRazorpayPaymentStatus(status: string | null | undefined): UnifiedPaymentStatus {
  if (!status) return 'unknown'
  return PAYMENT_STATUS_MAP[status] ?? 'unknown'
}

export function mapRazorpayOrderStatus(status: string | null | undefined): UnifiedPaymentStatus {
  if (!status) return 'unknown'
  return ORDER_STATUS_MAP[status] ?? 'unknown'
}

/**
 * Webhook events this gateway subscribes to.
 * - `payment.failed` maps to `pending`: the order stays payable (customer can retry in Checkout),
 *   so the transaction is kept open and the failure is only recorded as gateway status/metadata.
 *   Abandoned orders are closed by the host (cancel) rather than by a single failed attempt.
 * - `refund.processed` resolves to full/partial refund via the payment's `refund_status`
 *   (passed as the provider status, see webhook-handler).
 */
export const RAZORPAY_WEBHOOK_EVENTS = [
  'payment.authorized',
  'payment.captured',
  'payment.failed',
  'order.paid',
  'refund.processed',
] as const

export type RazorpayWebhookEventType = (typeof RAZORPAY_WEBHOOK_EVENTS)[number]

const EVENT_STATUS_MAP: Record<string, UnifiedPaymentStatus> = {
  'payment.authorized': 'authorized',
  'payment.captured': 'captured',
  'payment.failed': 'pending',
  'order.paid': 'captured',
}

/**
 * Map a webhook event to a unified status. `providerStatus` is consulted for refund events,
 * where it carries the payment's `refund_status` (`partial` | `full`).
 */
export function mapRazorpayWebhookEvent(eventType: string, providerStatus?: string | null): UnifiedPaymentStatus | undefined {
  if (eventType === 'refund.processed') {
    return providerStatus === 'partial' ? 'partially_refunded' : 'refunded'
  }
  return EVENT_STATUS_MAP[eventType]
}

/** Refund entity status: pending | processed | failed. */
export function mapRazorpayRefundStatus(
  refundStatus: string | null | undefined,
  isPartial: boolean,
): UnifiedPaymentStatus {
  if (refundStatus === 'processed') return isPartial ? 'partially_refunded' : 'refunded'
  if (refundStatus === 'failed') return 'failed'
  return 'pending'
}

export type RazorpayPaymentSummary = {
  id: string
  status: string
  amount: number
  amount_refunded?: number | null
  refund_status?: string | null
  captured?: boolean | null
}

/**
 * Derive the order-level unified status from the order entity and its payment attempts.
 * Precedence: refunds > captured > authorized > order state; failed attempts never terminate.
 */
export function deriveRazorpayOrderStatus(
  orderStatus: string | null | undefined,
  payments: RazorpayPaymentSummary[],
): { status: UnifiedPaymentStatus; payment: RazorpayPaymentSummary | null } {
  const settled = payments.find((payment) => payment.status === 'captured' || payment.status === 'refunded')
  if (settled) {
    const refunded = settled.amount_refunded ?? 0
    if (settled.status === 'refunded' || (refunded > 0 && refunded >= settled.amount)) {
      return { status: 'refunded', payment: settled }
    }
    if (refunded > 0) return { status: 'partially_refunded', payment: settled }
    return { status: 'captured', payment: settled }
  }
  const authorized = payments.find((payment) => payment.status === 'authorized')
  if (authorized) return { status: 'authorized', payment: authorized }

  const orderLevel = mapRazorpayOrderStatus(orderStatus)
  return { status: orderLevel === 'unknown' ? 'pending' : orderLevel, payment: null }
}
