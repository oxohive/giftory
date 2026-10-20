import { describe, expect, it } from '@jest/globals'
import { recordPayoutSchema, createAdjustmentSchema } from '../../data/validators'

/**
 * This task's acceptance criteria require that "zero-amount, negative-amount,
 * fractional-paise, and missing-reference/reason submissions are all
 * rejected server-side (don't rely on client validation alone)". The
 * existing `payouts/__tests__/contracts.test.ts` (owned by a different lane,
 * not touched here) already covers zero/negative/missing-note for both
 * schemas. It does not cover a fractional-paise amount (e.g. `100.5`), which
 * `z.number().int()` rejects but was never asserted directly — this file
 * closes that one gap against the real, already-shipped validators (no
 * mocking: these are the exact Zod schemas the admin API routes parse
 * request bodies with).
 */
describe('recordPayoutSchema — fractional paise', () => {
  it('rejects an amount with a fractional (sub-paise) component', () => {
    const result = recordPayoutSchema.safeParse({
      dealerProfileId: 'a1b2c3d4-e5f6-4789-8abc-def012345678',
      amount: 100.5,
      note: 'UTR000000000001',
    })
    expect(result.success).toBe(false)
  })
})

describe('createAdjustmentSchema — fractional paise', () => {
  it('rejects an amount with a fractional (sub-paise) component', () => {
    const result = createAdjustmentSchema.safeParse({
      dealerProfileId: 'a1b2c3d4-e5f6-4789-8abc-def012345678',
      direction: 'credit',
      amount: 12.34,
      note: 'Some reason',
    })
    expect(result.success).toBe(false)
  })
})
