import { describe, expect, it } from '@jest/globals'
import {
  commissionRuleCreateSchema,
  commissionRuleDeactivateSchema,
  commissionRuleListSchema,
} from '../data/validators'
import { MAX_RATE_BPS, MIN_RATE_BPS } from '../lib/constants'
import { computeCommissionAmount } from '../lib/rateResolver'
import { serializeCommissionRule, serializeCommissionSnapshot } from '../commands/shared'
import type { CommissionRule, OrderCommissionSnapshot } from '../data/entities'

const VALID_UUID = 'a1b2c3d4-e5f6-4789-8abc-def012345678'
const VALID_UUID_2 = 'b2c3d4e5-f6a7-4890-9bcd-ef0123456789'
const VALID_UUID_3 = 'c3d4e5f6-a7b8-4901-abcd-f01234567890'

// ── commissionRuleCreateSchema ────────────────────────────────────────────────

describe('commissionRuleCreateSchema', () => {
  const validPayload = {
    rateBps: 1800,
    effectiveFrom: '2024-01-01',
  }

  it('accepts a valid payload with required fields only', () => {
    const result = commissionRuleCreateSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.rateBps).toBe(1800)
      expect(result.data.effectiveFrom).toBe('2024-01-01')
    }
  })

  it('accepts a valid payload with all optional fields', () => {
    const result = commissionRuleCreateSchema.safeParse({
      ...validPayload,
      dealerProfileId: VALID_UUID,
      productTypeCode: 'ELECTRONICS',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dealerProfileId).toBe(VALID_UUID)
      expect(result.data.productTypeCode).toBe('ELECTRONICS')
    }
  })

  it('strips tenantId from the payload (security — scope must not come from user payload)', () => {
    const result = commissionRuleCreateSchema.safeParse({
      ...validPayload,
      tenantId: VALID_UUID,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).tenantId).toBeUndefined()
    }
  })

  it('strips organizationId from the payload (security — scope must not come from user payload)', () => {
    const result = commissionRuleCreateSchema.safeParse({
      ...validPayload,
      organizationId: VALID_UUID,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).organizationId).toBeUndefined()
    }
  })

  it('strips both tenantId and organizationId together', () => {
    const result = commissionRuleCreateSchema.safeParse({
      ...validPayload,
      tenantId: VALID_UUID,
      organizationId: VALID_UUID_2,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).tenantId).toBeUndefined()
      expect((result.data as Record<string, unknown>).organizationId).toBeUndefined()
    }
  })

  it('rejects rateBps below MIN_RATE_BPS (1)', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, rateBps: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects rateBps of negative value', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, rateBps: -1 })
    expect(result.success).toBe(false)
  })

  it(`accepts rateBps at MIN_RATE_BPS (${MIN_RATE_BPS})`, () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, rateBps: MIN_RATE_BPS })
    expect(result.success).toBe(true)
  })

  it(`accepts rateBps at MAX_RATE_BPS (${MAX_RATE_BPS})`, () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, rateBps: MAX_RATE_BPS })
    expect(result.success).toBe(true)
  })

  it(`rejects rateBps above MAX_RATE_BPS (${MAX_RATE_BPS})`, () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, rateBps: MAX_RATE_BPS + 1 })
    expect(result.success).toBe(false)
  })

  it('rejects a non-integer rateBps', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, rateBps: 18.5 })
    expect(result.success).toBe(false)
  })

  it('rejects malformed effectiveFrom (not YYYY-MM-DD)', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, effectiveFrom: '01-01-2024' })
    expect(result.success).toBe(false)
  })

  it('rejects effectiveFrom with time component', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, effectiveFrom: '2024-01-01T00:00:00Z' })
    expect(result.success).toBe(false)
  })

  it('rejects effectiveFrom as an empty string', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, effectiveFrom: '' })
    expect(result.success).toBe(false)
  })

  it('accepts null dealerProfileId (platform-wide rule)', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, dealerProfileId: null })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dealerProfileId).toBeNull()
    }
  })

  it('accepts null productTypeCode', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, productTypeCode: null })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.productTypeCode).toBeNull()
    }
  })

  it('rejects a non-UUID dealerProfileId', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, dealerProfileId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty productTypeCode (min length 1)', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, productTypeCode: '   ' })
    // trim + min(1) means whitespace-only → empty after trim → fail
    expect(result.success).toBe(false)
  })

  it('rejects a productTypeCode longer than 100 characters', () => {
    const result = commissionRuleCreateSchema.safeParse({ ...validPayload, productTypeCode: 'A'.repeat(101) })
    expect(result.success).toBe(false)
  })
})

// ── commissionRuleDeactivateSchema ────────────────────────────────────────────

describe('commissionRuleDeactivateSchema', () => {
  it('accepts a valid UUID id', () => {
    const result = commissionRuleDeactivateSchema.safeParse({ id: VALID_UUID })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(VALID_UUID)
    }
  })

  it('rejects a non-UUID id', () => {
    const result = commissionRuleDeactivateSchema.safeParse({ id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects a missing id', () => {
    const result = commissionRuleDeactivateSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects an empty string id', () => {
    const result = commissionRuleDeactivateSchema.safeParse({ id: '' })
    expect(result.success).toBe(false)
  })

  it('strips tenantId (security)', () => {
    const result = commissionRuleDeactivateSchema.safeParse({ id: VALID_UUID, tenantId: VALID_UUID_2 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).tenantId).toBeUndefined()
    }
  })

  it('strips organizationId (security)', () => {
    const result = commissionRuleDeactivateSchema.safeParse({ id: VALID_UUID, organizationId: VALID_UUID_2 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).organizationId).toBeUndefined()
    }
  })
})

// ── commissionRuleListSchema ──────────────────────────────────────────────────

describe('commissionRuleListSchema', () => {
  it('defaults activeOnly to true when not supplied', () => {
    const result = commissionRuleListSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.activeOnly).toBe(true)
    }
  })

  it('defaults page to 1 when not supplied', () => {
    const result = commissionRuleListSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
    }
  })

  it('defaults pageSize to 25 when not supplied', () => {
    const result = commissionRuleListSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageSize).toBe(25)
    }
  })

  it('coerces string page to number', () => {
    const result = commissionRuleListSchema.safeParse({ page: '3' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(3)
    }
  })

  it('coerces string pageSize to number', () => {
    const result = commissionRuleListSchema.safeParse({ pageSize: '50' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageSize).toBe(50)
    }
  })

  it('coerces non-empty string "false" for activeOnly to true (z.coerce.boolean uses Boolean())', () => {
    // z.coerce.boolean() wraps Boolean() — Boolean("false") is true (non-empty string)
    const result = commissionRuleListSchema.safeParse({ activeOnly: 'false' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.activeOnly).toBe(true)
    }
  })

  it('accepts activeOnly = false explicitly', () => {
    const result = commissionRuleListSchema.safeParse({ activeOnly: false })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.activeOnly).toBe(false)
    }
  })

  it('rejects pageSize above 100', () => {
    const result = commissionRuleListSchema.safeParse({ pageSize: 101 })
    expect(result.success).toBe(false)
  })

  it('accepts pageSize at maximum (100)', () => {
    const result = commissionRuleListSchema.safeParse({ pageSize: 100 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageSize).toBe(100)
    }
  })

  it('rejects page below 1', () => {
    const result = commissionRuleListSchema.safeParse({ page: 0 })
    expect(result.success).toBe(false)
  })

  it('accepts a valid dealerProfileId filter', () => {
    const result = commissionRuleListSchema.safeParse({ dealerProfileId: VALID_UUID })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dealerProfileId).toBe(VALID_UUID)
    }
  })

  it('rejects a non-UUID dealerProfileId filter', () => {
    const result = commissionRuleListSchema.safeParse({ dealerProfileId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })
})

// ── computeCommissionAmount ───────────────────────────────────────────────────

describe('computeCommissionAmount', () => {
  it('18% rate (1800 bps) on 1000 paise returns 180 paise', () => {
    expect(computeCommissionAmount(1000, 1800)).toBe(180)
  })

  it('10% rate (1000 bps) on 999 paise returns 100 paise (rounds 99.9)', () => {
    expect(computeCommissionAmount(999, 1000)).toBe(100)
  })

  it('0 bps rate always returns 0 paise regardless of subtotal', () => {
    expect(computeCommissionAmount(1000, 0)).toBe(0)
    expect(computeCommissionAmount(0, 0)).toBe(0)
    expect(computeCommissionAmount(99999, 0)).toBe(0)
  })

  it('full rate 10000 bps (100%) on 1000 paise returns 1000 paise', () => {
    expect(computeCommissionAmount(1000, MAX_RATE_BPS)).toBe(1000)
  })

  it('1 bps on 1 paise rounds down to 0 paise (ROUND(0.0001) = 0)', () => {
    expect(computeCommissionAmount(1, 1)).toBe(0)
  })

  it('1 bps on 5000 paise rounds to 1 paise (ROUND(0.5) = 1)', () => {
    // 5000 * 1 / 10000 = 0.5 → Math.round(0.5) = 1
    expect(computeCommissionAmount(5000, 1)).toBe(1)
  })

  it('15% rate (1500 bps) on 333 paise rounds correctly', () => {
    // 333 * 1500 / 10000 = 49.95 → Math.round(49.95) = 50
    expect(computeCommissionAmount(333, 1500)).toBe(50)
  })

  it('handles zero subtotal correctly', () => {
    expect(computeCommissionAmount(0, 1800)).toBe(0)
  })

  it('throws when rateBps exceeds MAX_RATE_BPS', () => {
    expect(() => computeCommissionAmount(1000, MAX_RATE_BPS + 1)).toThrow()
  })

  it('throws when rateBps is negative', () => {
    expect(() => computeCommissionAmount(1000, -1)).toThrow()
  })

  it('includes out-of-range rateBps in throw message', () => {
    expect(() => computeCommissionAmount(1000, 10001)).toThrow(/10001/)
  })
})

// ── serializeCommissionRule ───────────────────────────────────────────────────

describe('serializeCommissionRule', () => {
  const makeRule = (overrides: Partial<CommissionRule> = {}): CommissionRule => ({
    id: VALID_UUID,
    tenantId: VALID_UUID_2,
    dealerProfileId: VALID_UUID_3,
    productTypeCode: 'ELECTRONICS',
    rateBps: 1800,
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    createdBy: VALID_UUID,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  })

  it('returns all expected fields in output', () => {
    const rule = makeRule()
    const result = serializeCommissionRule(rule)
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('tenantId')
    expect(result).toHaveProperty('dealerProfileId')
    expect(result).toHaveProperty('productTypeCode')
    expect(result).toHaveProperty('rateBps')
    expect(result).toHaveProperty('effectiveFrom')
    expect(result).toHaveProperty('effectiveTo')
    expect(result).toHaveProperty('createdBy')
    expect(result).toHaveProperty('createdAt')
  })

  it('rateBps is a number in output', () => {
    const result = serializeCommissionRule(makeRule())
    expect(typeof result.rateBps).toBe('number')
    expect(result.rateBps).toBe(1800)
  })

  it('effectiveTo is null when rule is active', () => {
    const result = serializeCommissionRule(makeRule({ effectiveTo: null }))
    expect(result.effectiveTo).toBeNull()
  })

  it('effectiveTo is a date string when rule is deactivated', () => {
    const result = serializeCommissionRule(makeRule({ effectiveTo: '2024-06-30' }))
    expect(result.effectiveTo).toBe('2024-06-30')
  })

  it('converts createdAt Date to ISO string', () => {
    const date = new Date('2024-01-15T08:30:00Z')
    const result = serializeCommissionRule(makeRule({ createdAt: date }))
    expect(result.createdAt).toBe(date.toISOString())
  })

  it('serializes string createdAt as-is', () => {
    const rule = makeRule({ createdAt: '2024-01-15T08:30:00Z' as unknown as Date })
    const result = serializeCommissionRule(rule)
    expect(result.createdAt).toBe('2024-01-15T08:30:00Z')
  })

  it('dealerProfileId is null when no dealer is scoped (platform-wide rule)', () => {
    const result = serializeCommissionRule(makeRule({ dealerProfileId: null }))
    expect(result.dealerProfileId).toBeNull()
  })

  it('productTypeCode is null when rule applies to all product types', () => {
    const result = serializeCommissionRule(makeRule({ productTypeCode: null }))
    expect(result.productTypeCode).toBeNull()
  })

  it('serializes ids as strings', () => {
    const result = serializeCommissionRule(makeRule())
    expect(typeof result.id).toBe('string')
    expect(typeof result.tenantId).toBe('string')
    expect(typeof result.createdBy).toBe('string')
  })

  it('output id matches input id', () => {
    const result = serializeCommissionRule(makeRule())
    expect(result.id).toBe(VALID_UUID)
  })
})

// ── serializeCommissionSnapshot ───────────────────────────────────────────────

describe('serializeCommissionSnapshot', () => {
  const makeSnapshot = (overrides: Partial<OrderCommissionSnapshot> = {}): OrderCommissionSnapshot => ({
    id: VALID_UUID,
    assignmentId: VALID_UUID_2,
    orderId: VALID_UUID_3,
    dealerProfileId: VALID_UUID,
    tenantId: VALID_UUID_2,
    subtotalAmount: 10000,
    currencyCode: 'INR',
    commissionRateBps: 1800,
    commissionAmount: 1800,
    ruleId: VALID_UUID_3,
    snapshottedAt: new Date('2024-03-10T12:00:00Z'),
    ...overrides,
  })

  it('returns all expected fields in output', () => {
    const result = serializeCommissionSnapshot(makeSnapshot())
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('assignmentId')
    expect(result).toHaveProperty('orderId')
    expect(result).toHaveProperty('dealerProfileId')
    expect(result).toHaveProperty('tenantId')
    expect(result).toHaveProperty('subtotalAmount')
    expect(result).toHaveProperty('currencyCode')
    expect(result).toHaveProperty('commissionRateBps')
    expect(result).toHaveProperty('commissionAmount')
    expect(result).toHaveProperty('ruleId')
    expect(result).toHaveProperty('snapshottedAt')
  })

  it('subtotalAmount is an integer in output', () => {
    const result = serializeCommissionSnapshot(makeSnapshot())
    expect(Number.isInteger(result.subtotalAmount)).toBe(true)
    expect(result.subtotalAmount).toBe(10000)
  })

  it('commissionAmount is an integer in output', () => {
    const result = serializeCommissionSnapshot(makeSnapshot())
    expect(Number.isInteger(result.commissionAmount)).toBe(true)
    expect(result.commissionAmount).toBe(1800)
  })

  it('commissionRateBps is a number in output', () => {
    const result = serializeCommissionSnapshot(makeSnapshot())
    expect(typeof result.commissionRateBps).toBe('number')
    expect(result.commissionRateBps).toBe(1800)
  })

  it('ruleId is null when no rule matched', () => {
    const result = serializeCommissionSnapshot(makeSnapshot({ ruleId: null }))
    expect(result.ruleId).toBeNull()
  })

  it('ruleId is present when a rule was applied', () => {
    const result = serializeCommissionSnapshot(makeSnapshot({ ruleId: VALID_UUID_3 }))
    expect(result.ruleId).toBe(VALID_UUID_3)
  })

  it('converts snapshottedAt Date to ISO string', () => {
    const date = new Date('2024-03-10T12:00:00Z')
    const result = serializeCommissionSnapshot(makeSnapshot({ snapshottedAt: date }))
    expect(result.snapshottedAt).toBe(date.toISOString())
  })

  it('serializes string snapshottedAt as-is', () => {
    const snap = makeSnapshot({ snapshottedAt: '2024-03-10T12:00:00Z' as unknown as Date })
    const result = serializeCommissionSnapshot(snap)
    expect(result.snapshottedAt).toBe('2024-03-10T12:00:00Z')
  })

  it('serializes all ids as strings', () => {
    const result = serializeCommissionSnapshot(makeSnapshot())
    expect(typeof result.id).toBe('string')
    expect(typeof result.assignmentId).toBe('string')
    expect(typeof result.orderId).toBe('string')
    expect(typeof result.dealerProfileId).toBe('string')
    expect(typeof result.tenantId).toBe('string')
  })

  it('output id matches input id', () => {
    const result = serializeCommissionSnapshot(makeSnapshot())
    expect(result.id).toBe(VALID_UUID)
  })

  it('currencyCode is preserved in output', () => {
    const result = serializeCommissionSnapshot(makeSnapshot({ currencyCode: 'INR' }))
    expect(result.currencyCode).toBe('INR')
  })

  it('zero commissionAmount is serialized correctly (free assignment)', () => {
    const result = serializeCommissionSnapshot(makeSnapshot({ commissionRateBps: 0, commissionAmount: 0, ruleId: null }))
    expect(result.commissionAmount).toBe(0)
    expect(result.commissionRateBps).toBe(0)
    expect(result.ruleId).toBeNull()
  })
})
