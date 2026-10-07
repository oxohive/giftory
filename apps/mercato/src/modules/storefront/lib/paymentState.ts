import { MONEY_TAKEN_STATUSES, SALES_PAYMENT_STATUS_BY_UNIFIED } from './constants'
import { round2, toNumberOrNull, type OrderTotals } from './pricing'

/** Pure payment/total helpers shared by checkout, order reads and payment sync. */

type Amount = string | number | null | undefined

/** Sales folds shipping into `subtotalGrossAmount`; shoppers see items and shipping apart. */
export function orderTotals(order: {
  subtotalGrossAmount?: Amount
  shippingGrossAmount?: Amount
  taxTotalAmount?: Amount
  grandTotalGrossAmount?: Amount
}): OrderTotals {
  const shipping = round2(toNumberOrNull(order.shippingGrossAmount) ?? 0)
  return {
    subtotal: round2(Math.max(0, (toNumberOrNull(order.subtotalGrossAmount) ?? 0) - shipping)),
    shipping,
    tax: round2(toNumberOrNull(order.taxTotalAmount) ?? 0),
    grandTotal: round2(toNumberOrNull(order.grandTotalGrossAmount) ?? 0),
  }
}

/** Amount still due, as `sales` computes it for the payment_gateways order reconciliation. */
export function orderAmountDue(order: {
  outstandingAmount?: Amount
  paidTotalAmount?: Amount
  refundedTotalAmount?: Amount
  grandTotalGrossAmount?: Amount
}): number {
  const outstanding = toNumberOrNull(order.outstandingAmount) ?? 0
  const paid = toNumberOrNull(order.paidTotalAmount) ?? 0
  const refunded = toNumberOrNull(order.refundedTotalAmount) ?? 0
  if (outstanding > 0 || paid > 0 || refunded > 0) return outstanding
  return toNumberOrNull(order.grandTotalGrossAmount) ?? 0
}

export function desiredSalesPaymentStatus(unifiedStatus: string): string | null {
  return SALES_PAYMENT_STATUS_BY_UNIFIED[unifiedStatus] ?? null
}

export function paidAmountOf(transaction: { amount: unknown; capturedAmount: unknown }): number {
  const captured = toNumberOrNull(transaction.capturedAmount) ?? 0
  return round2(captured > 0 ? captured : toNumberOrNull(transaction.amount) ?? 0)
}

/** Shopper-facing payment status: a paid attempt wins over later abandoned retries, else the newest attempt. */
export function shopperPaymentStatus(
  order: { paymentStatus?: string | null },
  checkouts: Array<{ paymentStatus: string; gatewayTransactionId?: string | null }>,
): string | null {
  const paid = checkouts.find((checkout) => MONEY_TAKEN_STATUSES.has(checkout.paymentStatus))
  if (paid) return paid.paymentStatus
  const latest = checkouts.find((checkout) => checkout.gatewayTransactionId) ?? checkouts[0]
  return latest?.paymentStatus ?? order.paymentStatus ?? null
}
