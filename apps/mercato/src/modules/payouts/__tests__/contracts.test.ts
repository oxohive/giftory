import { describe, expect, it } from '@jest/globals'
import { recordPayoutSchema, createAdjustmentSchema, ledgerListSchema } from '../data/validators'
import { ENTRY_TYPE_DIRECTION } from '../lib/constants'
import { serializeLedgerEntry } from '../commands/shared'
import type { DealerLedgerEntry } from '../data/entities'

const VALID_UUID = 'a1b2c3d4-e5f6-4789-8abc-def012345678'
const VALID_UUID_2 = 'b2c3d4e5-f6a7-4890-9bcd-ef0123456789'

// ---------------------------------------------------------------------------
// recordPayoutSchema
// ---------------------------------------------------------------------------

describe('recordPayoutSchema', () => {
  it('accepts a valid payload', () => {
    const result = recordPayoutSchema.parse({
      dealerProfileId: VALID_UUID,
      amount: 50000,
      note: 'UTR123456789012',
    })
    expect(result.dealerProfileId).toBe(VALID_UUID)
    expect(result.amount).toBe(50000)
    expect(result.note).toBe('UTR123456789012')
  })

  it('strips tenantId and organizationId from payload', () => {
    const result = recordPayoutSchema.parse({
      dealerProfileId: VALID_UUID,
      amount: 10000,
      note: 'UTR000000000001',
      tenantId: VALID_UUID_2,
      organizationId: VALID_UUID_2,
    }) as Record<string, unknown>
    expect(result.tenantId).toBeUndefined()
    expect(result.organizationId).toBeUndefined()
  })

  it('rejects amount = 0', () => {
    const result = recordPayoutSchema.safeParse({
      dealerProfileId: VALID_UUID,
      amount: 0,
      note: 'UTR000000000001',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative amount', () => {
    const result = recordPayoutSchema.safeParse({
      dealerProfileId: VALID_UUID,
      amount: -100,
      note: 'UTR000000000001',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty note', () => {
    const result = recordPayoutSchema.safeParse({
      dealerProfileId: VALID_UUID,
      amount: 10000,
      note: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects whitespace-only note (trimmed to empty)', () => {
    const result = recordPayoutSchema.safeParse({
      dealerProfileId: VALID_UUID,
      amount: 10000,
      note: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing dealerProfileId', () => {
    const result = recordPayoutSchema.safeParse({
      amount: 10000,
      note: 'UTR000000000001',
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID dealerProfileId', () => {
    const result = recordPayoutSchema.safeParse({
      dealerProfileId: 'not-a-uuid',
      amount: 10000,
      note: 'UTR000000000001',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createAdjustmentSchema
// ---------------------------------------------------------------------------

describe('createAdjustmentSchema', () => {
  it('accepts a valid credit adjustment', () => {
    const result = createAdjustmentSchema.parse({
      dealerProfileId: VALID_UUID,
      direction: 'credit',
      amount: 5000,
      note: 'Manual credit for dispute resolution',
    })
    expect(result.dealerProfileId).toBe(VALID_UUID)
    expect(result.direction).toBe('credit')
    expect(result.amount).toBe(5000)
  })

  it('accepts a valid debit adjustment', () => {
    const result = createAdjustmentSchema.parse({
      dealerProfileId: VALID_UUID,
      direction: 'debit',
      amount: 2500,
      note: 'Debit for reversed commission',
    })
    expect(result.direction).toBe('debit')
    expect(result.amount).toBe(2500)
  })

  it('rejects empty note', () => {
    const result = createAdjustmentSchema.safeParse({
      dealerProfileId: VALID_UUID,
      direction: 'credit',
      amount: 1000,
      note: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects whitespace-only note', () => {
    const result = createAdjustmentSchema.safeParse({
      dealerProfileId: VALID_UUID,
      direction: 'credit',
      amount: 1000,
      note: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('rejects direction other than credit or debit', () => {
    const result = createAdjustmentSchema.safeParse({
      dealerProfileId: VALID_UUID,
      direction: 'refund',
      amount: 1000,
      note: 'Some reason',
    })
    expect(result.success).toBe(false)
  })

  it('rejects amount = 0', () => {
    const result = createAdjustmentSchema.safeParse({
      dealerProfileId: VALID_UUID,
      direction: 'credit',
      amount: 0,
      note: 'Some reason',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative amount', () => {
    const result = createAdjustmentSchema.safeParse({
      dealerProfileId: VALID_UUID,
      direction: 'credit',
      amount: -500,
      note: 'Some reason',
    })
    expect(result.success).toBe(false)
  })

  it('strips tenantId and organizationId from payload', () => {
    const result = createAdjustmentSchema.parse({
      dealerProfileId: VALID_UUID,
      direction: 'debit',
      amount: 1000,
      note: 'Adjustment reason',
      tenantId: VALID_UUID_2,
      organizationId: VALID_UUID_2,
    }) as Record<string, unknown>
    expect(result.tenantId).toBeUndefined()
    expect(result.organizationId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// ledgerListSchema
// ---------------------------------------------------------------------------

describe('ledgerListSchema', () => {
  it('applies default pagination when no query given', () => {
    const result = ledgerListSchema.parse({})
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(25)
  })

  it('coerces string numbers for page and pageSize', () => {
    const result = ledgerListSchema.parse({ page: '3', pageSize: '50' })
    expect(result.page).toBe(3)
    expect(result.pageSize).toBe(50)
  })

  it('rejects pageSize above 100', () => {
    expect(ledgerListSchema.safeParse({ pageSize: '101' }).success).toBe(false)
    expect(ledgerListSchema.safeParse({ pageSize: 101 }).success).toBe(false)
  })

  it('rejects page below 1', () => {
    expect(ledgerListSchema.safeParse({ page: 0 }).success).toBe(false)
    expect(ledgerListSchema.safeParse({ page: -1 }).success).toBe(false)
  })

  it('accepts all valid entryType values', () => {
    const validTypes = ['commission_earned', 'payout_disbursed', 'adjustment_credit', 'adjustment_debit'] as const
    for (const entryType of validTypes) {
      const result = ledgerListSchema.safeParse({ entryType })
      expect(result.success).toBe(true)
    }
  })

  it('rejects an unknown entryType', () => {
    expect(ledgerListSchema.safeParse({ entryType: 'unknown_type' }).success).toBe(false)
    expect(ledgerListSchema.safeParse({ entryType: 'commission_paid' }).success).toBe(false)
  })

  it('accepts valid direction values', () => {
    expect(ledgerListSchema.safeParse({ direction: 'credit' }).success).toBe(true)
    expect(ledgerListSchema.safeParse({ direction: 'debit' }).success).toBe(true)
  })

  it('rejects invalid direction value', () => {
    expect(ledgerListSchema.safeParse({ direction: 'both' }).success).toBe(false)
  })

  it('accepts optional dealerProfileId as UUID', () => {
    const result = ledgerListSchema.parse({ dealerProfileId: VALID_UUID })
    expect(result.dealerProfileId).toBe(VALID_UUID)
  })

  it('rejects non-UUID dealerProfileId', () => {
    expect(ledgerListSchema.safeParse({ dealerProfileId: 'not-a-uuid' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ENTRY_TYPE_DIRECTION
// ---------------------------------------------------------------------------

describe('ENTRY_TYPE_DIRECTION', () => {
  it('maps commission_earned to credit', () => {
    expect(ENTRY_TYPE_DIRECTION.commission_earned).toBe('credit')
  })

  it('maps payout_disbursed to debit', () => {
    expect(ENTRY_TYPE_DIRECTION.payout_disbursed).toBe('debit')
  })

  it('maps adjustment_credit to credit', () => {
    expect(ENTRY_TYPE_DIRECTION.adjustment_credit).toBe('credit')
  })

  it('maps adjustment_debit to debit', () => {
    expect(ENTRY_TYPE_DIRECTION.adjustment_debit).toBe('debit')
  })
})

// ---------------------------------------------------------------------------
// serializeLedgerEntry
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<DealerLedgerEntry> = {}): DealerLedgerEntry {
  return {
    id: VALID_UUID,
    dealerProfileId: VALID_UUID_2,
    tenantId: 'c3d4e5f6-a7b8-4901-abcd-f01234567890',
    entryType: 'commission_earned',
    amount: '75000' as unknown as string,
    currencyCode: 'INR',
    direction: 'credit',
    referenceType: 'order_commission_snapshot',
    referenceId: VALID_UUID,
    note: 'Commission for order #ORD-001',
    createdBy: 'd4e5f6a7-b8c9-4012-bcde-f12345678901',
    createdAt: new Date('2026-10-12T08:00:00.000Z'),
    ...overrides,
  } as DealerLedgerEntry
}

describe('serializeLedgerEntry', () => {
  it('includes all expected fields in output', () => {
    const entry = makeEntry()
    const result = serializeLedgerEntry(entry)

    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('dealerProfileId')
    expect(result).toHaveProperty('tenantId')
    expect(result).toHaveProperty('entryType')
    expect(result).toHaveProperty('amount')
    expect(result).toHaveProperty('currencyCode')
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('referenceType')
    expect(result).toHaveProperty('referenceId')
    expect(result).toHaveProperty('note')
    expect(result).toHaveProperty('createdBy')
    expect(result).toHaveProperty('createdAt')
  })

  it('parses amount from numeric string to integer', () => {
    const entry = makeEntry({ amount: '150000' as unknown as string })
    const result = serializeLedgerEntry(entry)
    expect(typeof result.amount).toBe('number')
    expect(result.amount).toBe(150000)
  })

  it('parses amount from a numeric string that has no fractional part', () => {
    const entry = makeEntry({ amount: '1' as unknown as string })
    const result = serializeLedgerEntry(entry)
    expect(result.amount).toBe(1)
  })

  it('serializes note as null when not set', () => {
    const entry = makeEntry({ note: undefined })
    const result = serializeLedgerEntry(entry)
    expect(result.note).toBeNull()
  })

  it('serializes note as null when explicitly null', () => {
    const entry = makeEntry({ note: null as unknown as undefined })
    const result = serializeLedgerEntry(entry)
    expect(result.note).toBeNull()
  })

  it('preserves note when it is a non-empty string', () => {
    const entry = makeEntry({ note: 'UTR999888777666' })
    const result = serializeLedgerEntry(entry)
    expect(result.note).toBe('UTR999888777666')
  })

  it('converts createdAt Date to ISO string', () => {
    const date = new Date('2026-10-12T08:00:00.000Z')
    const entry = makeEntry({ createdAt: date })
    const result = serializeLedgerEntry(entry)
    expect(result.createdAt).toBe('2026-10-12T08:00:00.000Z')
  })

  it('converts createdAt non-Date to string', () => {
    const entry = makeEntry({ createdAt: '2026-10-12T08:00:00.000Z' as unknown as Date })
    const result = serializeLedgerEntry(entry)
    expect(typeof result.createdAt).toBe('string')
    expect(result.createdAt).toBe('2026-10-12T08:00:00.000Z')
  })

  it('returns correct field values for a full entry', () => {
    const entry = makeEntry()
    const result = serializeLedgerEntry(entry)

    expect(result.id).toBe(VALID_UUID)
    expect(result.dealerProfileId).toBe(VALID_UUID_2)
    expect(result.tenantId).toBe('c3d4e5f6-a7b8-4901-abcd-f01234567890')
    expect(result.entryType).toBe('commission_earned')
    expect(result.amount).toBe(75000)
    expect(result.currencyCode).toBe('INR')
    expect(result.direction).toBe('credit')
    expect(result.referenceType).toBe('order_commission_snapshot')
    expect(result.referenceId).toBe(VALID_UUID)
    expect(result.note).toBe('Commission for order #ORD-001')
    expect(result.createdBy).toBe('d4e5f6a7-b8c9-4012-bcde-f12345678901')
    expect(result.createdAt).toBe('2026-10-12T08:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// Gap 1 fix — payouts.dealer_access must be owner-only (FEAT-009: "staff
// cannot access commission or payout data"). This is the exact cell from
// CONTRACT-HANDOFF.md's permission matrix — if a future change
// accidentally grants this to dealer:staff too, this test catches it.
// ---------------------------------------------------------------------------

describe('setup.defaultRoleFeatures — Gap 1 fix (owner-only dealer_access)', () => {
  it('grants payouts.dealer_access to dealer:owner but NOT dealer:staff', async () => {
    const { setup } = await import('../setup')
    const { DEALER_OWNER_ROLE, DEALER_STAFF_ROLE } = await import('../lib/constants')
    expect(setup.defaultRoleFeatures?.[DEALER_OWNER_ROLE]).toContain('payouts.dealer_access')
    expect(setup.defaultRoleFeatures?.[DEALER_STAFF_ROLE] ?? []).not.toContain('payouts.dealer_access')
  })
})
