import { describe, expect, it } from '@jest/globals'
import { startOfIstWeek } from '../lib/dateWindows'

describe('startOfIstWeek', () => {
  it('returns the UTC instant of Monday 00:00 IST for a mid-week Thursday instant', () => {
    const now = new Date('2026-01-08T12:00:00.000Z') // Thursday 17:30 IST
    expect(startOfIstWeek(now).toISOString()).toBe('2026-01-04T18:30:00.000Z') // Monday 2026-01-05 00:00 IST
  })

  it('is idempotent at the exact Monday-00:00-IST boundary', () => {
    const now = new Date('2026-01-04T18:30:00.000Z') // exactly Monday 2026-01-05 00:00:00 IST
    expect(startOfIstWeek(now).toISOString()).toBe('2026-01-04T18:30:00.000Z')
  })

  it('rolls back to the PREVIOUS Monday one second before the boundary', () => {
    const now = new Date('2026-01-04T18:29:59.000Z') // Sunday 2026-01-04 23:59:59 IST
    expect(startOfIstWeek(now).toISOString()).toBe('2025-12-28T18:30:00.000Z') // Monday 2025-12-29 00:00 IST
  })

  it('never uses a bare UTC week boundary — IST and UTC disagree near local midnight', () => {
    // 2026-01-05T00:00:00Z is still Sunday 2026-01-04 in UTC terms, but it is
    // already Monday 05:30 in IST — the UTC week boundary (2026-01-05) would
    // be wrong by a full week relative to the IST one this function must use.
    const now = new Date('2026-01-05T00:00:00.000Z')
    const result = startOfIstWeek(now)
    expect(result.toISOString()).toBe('2026-01-04T18:30:00.000Z')
    expect(result.toISOString()).not.toBe(new Date('2026-01-05T00:00:00.000Z').toISOString())
  })
})
