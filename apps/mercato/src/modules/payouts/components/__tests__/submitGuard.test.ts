import { describe, expect, it } from '@jest/globals'
import { createSubmitGuard } from '../submitGuard'

/**
 * Double-click / double-submit guard required by this task's acceptance
 * criteria. Verified independently of React so mounting a dialog component
 * isn't needed to prove the behavior.
 */
describe('createSubmitGuard', () => {
  it('runs the first call normally and reports not-running once it settles', async () => {
    const guard = createSubmitGuard()
    expect(guard.isRunning()).toBe(false)
    const outcome = await guard.run(async () => 'done')
    expect(outcome).toEqual({ skipped: false, result: 'done' })
    expect(guard.isRunning()).toBe(false)
  })

  it('skips a second concurrent call while the first is still in flight — the double-submit guard', async () => {
    const guard = createSubmitGuard()
    let resolveFirst: (() => void) | undefined
    const first = guard.run(() => new Promise<string>((resolve) => {
      resolveFirst = () => resolve('first')
    }))

    // The first call hasn't resolved yet — isRunning must already be true,
    // and a second call started now must be skipped rather than firing a
    // second request.
    expect(guard.isRunning()).toBe(true)
    const second = guard.run(async () => 'second')
    const secondOutcome = await second
    expect(secondOutcome).toEqual({ skipped: true })

    resolveFirst?.()
    const firstOutcome = await first
    expect(firstOutcome).toEqual({ skipped: false, result: 'first' })
    expect(guard.isRunning()).toBe(false)
  })

  it('releases the guard even when the wrapped operation throws, so a failed submit can be retried', async () => {
    const guard = createSubmitGuard()
    await expect(guard.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(guard.isRunning()).toBe(false)
    const outcome = await guard.run(async () => 'retried')
    expect(outcome).toEqual({ skipped: false, result: 'retried' })
  })
})
