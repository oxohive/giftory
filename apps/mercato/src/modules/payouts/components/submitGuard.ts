/**
 * Plain (non-React) double-submit guard for the ledger mutation dialogs.
 *
 * The payout/adjustment endpoints now require an `Idempotency-Key` and replay
 * a retried request instead of double-recording it (see `idempotencyKey.ts`
 * and `payouts/lib/idempotency.ts`). This guard remains as the first line of
 * defence: it refuses to start a second submission while one is already in
 * flight, whether that's a genuine double-click or a repeated Cmd/Ctrl+Enter,
 * so the server never even sees the duplicate.
 *
 * Kept outside React so it's unit-testable without mounting a component.
 */
export type SubmitGuardResult<T> =
  | { skipped: false; result: T }
  | { skipped: true }

export type SubmitGuard = {
  isRunning: () => boolean
  run: <T>(fn: () => Promise<T>) => Promise<SubmitGuardResult<T>>
}

export function createSubmitGuard(): SubmitGuard {
  let running = false
  return {
    isRunning: () => running,
    async run<T>(fn: () => Promise<T>): Promise<SubmitGuardResult<T>> {
      if (running) return { skipped: true }
      running = true
      try {
        const result = await fn()
        return { skipped: false, result }
      } finally {
        running = false
      }
    },
  }
}
