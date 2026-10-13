/**
 * Plain (non-React) double-submit guard for the ledger mutation dialogs.
 *
 * The payout/adjustment endpoints accept no idempotency key and have no
 * server-side duplicate guard (see CONTRACT-HANDOFF.md / API-CONTRACTS.md
 * "Gap 4/5" — a retried `POST .../ledger/payout` or `.../ledger/adjustment`
 * double-records). This UI task cannot change those routes (outside its
 * owned paths), so the only mitigation available here is client-side:
 * refuse to start a second submission while one is already in flight,
 * whether that's a genuine double-click or a repeated Cmd/Ctrl+Enter.
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
