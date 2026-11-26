/**
 * Client-side `Idempotency-Key` lifecycle for the two ledger mutation dialogs
 * (record payout, add adjustment). Plain object, no React, so it is
 * unit-testable — same shape of reasoning as
 * `dealer_orders/components/idempotencyKeys.ts`.
 *
 * One key per dialog session:
 *   - `current()` mints a key on the first submit attempt and returns the SAME
 *     key on every resubmit while the dialog stays open. The server only
 *     stores a key once the ledger entry is written, so resubmitting after a
 *     validation error / insufficient balance (even with a corrected amount)
 *     works; but if an earlier attempt actually succeeded and only the
 *     response was lost, the retry is replayed instead of recording a second
 *     payout, and a changed body is rejected with 409 `idempotency_key_reused`.
 *   - `release()` is called on success and whenever the dialog closes, so the
 *     next time the admin opens it they get a fresh key (a new operation).
 */

export type IdempotencyKeyHolder = {
  current: () => string
  release: () => void
  peek: () => string | null
}

function randomUuid(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID()
  // Fallback for environments without `crypto.randomUUID` — mirrors
  // `dealer_orders/components/idempotencyKeys.ts`.
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${random()}${random()}-${random()}-4${random().slice(1)}-a${random().slice(1)}-${random()}${random()}${random()}`
}

export function createIdempotencyKeyHolder(mint: () => string = randomUuid): IdempotencyKeyHolder {
  let key: string | null = null
  return {
    current() {
      if (!key) key = mint()
      return key
    },
    release() {
      key = null
    },
    peek() {
      return key
    },
  }
}
