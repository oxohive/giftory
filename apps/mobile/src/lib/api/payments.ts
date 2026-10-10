import { z } from 'zod'
import { apiRequest } from './http'

/**
 * Razorpay confirm — `apps/mercato`'s `gateway_razorpay` module:
 *
 *   POST /api/gateway_razorpay/confirm
 *     body: { razorpay_order_id, razorpay_payment_id, razorpay_signature } (plus its own
 *     `Idempotency-Key` header) -> { transactionId, paymentId, status, synced }
 *
 * The server verifies the HMAC signature — this module (and the app generally) never does
 * signature math itself; it only relays the three Razorpay callback fields.
 *
 * RESOLVED (was flagged as a discrepancy, confirmed correct after reading the live route source):
 * `apps/mercato/src/modules/gateway_razorpay/api/confirm/route.ts` constructs its JSON response as
 * exactly `{transactionId: matched.id, paymentId: matched.paymentId, status, synced}` on BOTH
 * success paths (200 when the status sync succeeds, 202 when it's deferred to webhooks) — all four
 * fields are always present, no optionality. The only other response shapes are 401/422/429 error
 * bodies (`{error: string}`), which this module's `ApiError` handling (via TASK-03's `http.ts`)
 * already normalizes separately from this success schema. `transactionId`/`paymentId`/`synced` can
 * be relied on as always-present on a successful confirm, matching the original TASK-04 contract
 * exactly — the earlier caution was unwarranted (it came from checking the web storefront's own,
 * looser client-side schema, not the actual route).
 */

export interface RazorpayConfirmInput {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export interface RazorpayConfirmResult {
  transactionId: string
  paymentId: string
  status: string
  synced: boolean
}

const confirmResultWireSchema = z
  .object({
    transactionId: z.string().optional(),
    paymentId: z.string().optional(),
    status: z.string().optional(),
    synced: z.boolean().optional(),
  })
  .passthrough()

export async function confirmRazorpayPayment(
  input: RazorpayConfirmInput,
  idempotencyKey: string,
): Promise<RazorpayConfirmResult> {
  const res = await apiRequest('/api/gateway_razorpay/confirm', confirmResultWireSchema, {
    method: 'POST',
    idempotencyKey,
    body: input,
  })
  return {
    transactionId: res.transactionId ?? '',
    paymentId: res.paymentId ?? '',
    status: res.status ?? '',
    synced: res.synced ?? false,
  }
}
