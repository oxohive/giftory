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
 * FLAGGED DISCREPANCY: `apps/storefront/src/lib/api/payments.ts`'s `confirmResponseSchema` (its
 * cross-checked, live-verified schema for this same endpoint) only validates `{ ok?, status? }`
 * via `.passthrough()` — it does not confirm `transactionId`, `paymentId`, or `synced` are present
 * on the response, and the storefront caller never reads them back (it already has `transactionId`
 * from the preceding checkout call). TASK-04's spec explicitly documents the fuller
 * `{transactionId, paymentId, status, synced}` shape as the backend's live contract, so that is
 * implemented below per instructions to trust the task file's documented research — but this
 * should be re-verified against a live response before TASK-05-08 rely on `.paymentId`/`.synced`.
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
