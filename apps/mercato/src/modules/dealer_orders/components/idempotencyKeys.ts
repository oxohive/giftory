/**
 * Client-side `Idempotency-Key` management for the admin order-assignment
 * tab's write actions.
 *
 * Per API-CONTRACTS.md, only `POST`/`PUT /admin/orders/{id}/assignment`
 * (assign, reassign) require the header — `DELETE` (cancel) does not. The
 * backend currently requires-but-does-not-consume the header (Gap 4: no
 * replay store exists yet; the `409` on an existing active assignment is
 * what actually stops a duplicate *assign* today). This module is strictly
 * the client-side half this task owns: mint ONE key per distinct user
 * operation and make sure a retry of the SAME operation (a double-click
 * before the button disables, or a caller-level retried request) reuses
 * that same key instead of minting a new one — so this UI is already
 * correct the moment the backend grows a real replay store, and so two
 * fast clicks cannot even theoretically be read by a future server as two
 * different write intents.
 *
 * A "distinct operation" is one dialog session for one action on one
 * order — `assign:<orderId>` or `reassign:<orderId>`. The owning dialog
 * calls `getOrCreateIdempotencyKey` immediately before each network
 * attempt (so a key is only minted once an attempt actually happens, never
 * on dialog open), keeps reusing it across resubmits of a recoverable
 * error (validation message, "order not paid", a generic failure — the
 * user is retrying the SAME intent), and calls `releaseIdempotencyKey`
 * once that operation reaches a terminal outcome (success, a conflict that
 * invalidates the attempt, or the dialog being abandoned) so the next time
 * the user opens that action it is treated as a genuinely new operation.
 */

const activeKeys = new Map<string, string>()

function randomUuid(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID()
  // Fallback for environments without `crypto.randomUUID` (older browsers) —
  // mirrors the identical fallback already shipped in
  // `example/widgets/injection/todo-bulk-complete/widget.ts`.
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${random()}${random()}-${random()}-4${random().slice(1)}-a${random().slice(1)}-${random()}${random()}${random()}`
}

/** Build the stable per-operation key used to scope `activeKeys`. */
export function buildOperationKey(action: 'assign' | 'reassign', orderId: string): string {
  return `${action}:${orderId}`
}

/**
 * Returns the in-flight/last-attempted `Idempotency-Key` for this
 * operation, minting a new one only if none exists yet.
 */
export function getOrCreateIdempotencyKey(operationKey: string): string {
  const existing = activeKeys.get(operationKey)
  if (existing) return existing
  const created = randomUuid()
  activeKeys.set(operationKey, created)
  return created
}

/** Call once an operation reaches a terminal outcome — see module doc comment. */
export function releaseIdempotencyKey(operationKey: string): void {
  activeKeys.delete(operationKey)
}

/** Test/debug helper — does not mint. */
export function peekIdempotencyKey(operationKey: string): string | null {
  return activeKeys.get(operationKey) ?? null
}
