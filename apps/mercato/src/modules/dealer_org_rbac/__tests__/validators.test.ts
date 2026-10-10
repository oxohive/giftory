import { describe, expect, it } from '@jest/globals'
import { capabilitiesUpsertSchema, staffInviteSchema } from '../data/validators'
import { PRINTING_METHODS, INDIAN_STATE_CODES } from '../lib/constants'

// ---------------------------------------------------------------------------
// capabilitiesUpsertSchema
// ---------------------------------------------------------------------------

describe('capabilitiesUpsertSchema', () => {
  it('accepts an empty payload and applies all defaults', () => {
    const result = capabilitiesUpsertSchema.parse({})
    expect(result.productTypeCodes).toEqual([])
    expect(result.printingMethods).toEqual([])
    expect(result.maxDailyCapacity).toBe(0)
    expect(result.serviceableStates).toEqual([])
    expect(result.minOrderQty).toBe(1)
  })

  it('accepts a fully-populated valid payload', () => {
    const result = capabilitiesUpsertSchema.safeParse({
      productTypeCodes: ['mug', 'tshirt', 'photo_frame'],
      printingMethods: ['sublimation', 'dtg'],
      maxDailyCapacity: 500,
      serviceableStates: ['IN-MH', 'IN-KA', 'IN-DL'],
      minOrderQty: 10,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.productTypeCodes).toEqual(['mug', 'tshirt', 'photo_frame'])
      expect(result.data.maxDailyCapacity).toBe(500)
    }
  })

  it('accepts all known printing methods', () => {
    for (const method of PRINTING_METHODS) {
      expect(capabilitiesUpsertSchema.safeParse({ printingMethods: [method] }).success).toBe(true)
    }
  })

  it('rejects an unknown printing method', () => {
    expect(capabilitiesUpsertSchema.safeParse({ printingMethods: ['screen_print'] }).success).toBe(false)
    expect(capabilitiesUpsertSchema.safeParse({ printingMethods: ['SUBLIMATION'] }).success).toBe(false)
  })

  it('accepts a valid sample of Indian state codes', () => {
    const sample: string[] = ['IN-MH', 'IN-DL', 'IN-KA', 'IN-TN', 'IN-GJ']
    for (const code of sample) {
      expect(capabilitiesUpsertSchema.safeParse({ serviceableStates: [code] }).success).toBe(true)
    }
  })

  it('rejects an invalid state code', () => {
    expect(capabilitiesUpsertSchema.safeParse({ serviceableStates: ['MH'] }).success).toBe(false)
    expect(capabilitiesUpsertSchema.safeParse({ serviceableStates: ['IN-XX'] }).success).toBe(false)
    expect(capabilitiesUpsertSchema.safeParse({ serviceableStates: ['US-CA'] }).success).toBe(false)
  })

  it('rejects maxDailyCapacity below 0', () => {
    expect(capabilitiesUpsertSchema.safeParse({ maxDailyCapacity: -1 }).success).toBe(false)
  })

  it('rejects maxDailyCapacity above 100,000', () => {
    expect(capabilitiesUpsertSchema.safeParse({ maxDailyCapacity: 100_001 }).success).toBe(false)
  })

  it('rejects minOrderQty below 1', () => {
    expect(capabilitiesUpsertSchema.safeParse({ minOrderQty: 0 }).success).toBe(false)
  })

  it('rejects minOrderQty above 10,000', () => {
    expect(capabilitiesUpsertSchema.safeParse({ minOrderQty: 10_001 }).success).toBe(false)
  })

  it('rejects non-integer values for quantity fields', () => {
    expect(capabilitiesUpsertSchema.safeParse({ maxDailyCapacity: 50.5 }).success).toBe(false)
    expect(capabilitiesUpsertSchema.safeParse({ minOrderQty: 1.5 }).success).toBe(false)
  })

  it('rejects productTypeCodes with more than 100 entries', () => {
    const codes = Array.from({ length: 101 }, (_, i) => `product_${i}`)
    expect(capabilitiesUpsertSchema.safeParse({ productTypeCodes: codes }).success).toBe(false)
  })

  it('rejects unknown keys (strict schema)', () => {
    expect(capabilitiesUpsertSchema.safeParse({ tenantId: 'should-be-stripped' }).success).toBe(false)
  })

  it('PRINTING_METHODS constant is exhaustive in schema enum', () => {
    // Every printing method in the constant must be accepted by the schema.
    const result = capabilitiesUpsertSchema.safeParse({ printingMethods: [...PRINTING_METHODS] })
    expect(result.success).toBe(true)
  })

  it('INDIAN_STATE_CODES constant is exhaustive in schema enum', () => {
    // A batch of all state codes must be accepted.
    const result = capabilitiesUpsertSchema.safeParse({ serviceableStates: [...INDIAN_STATE_CODES] })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// staffInviteSchema
// ---------------------------------------------------------------------------

describe('staffInviteSchema', () => {
  it('accepts a minimal payload with just an email', () => {
    const result = staffInviteSchema.safeParse({ email: 'staff@acmegifts.in' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBeUndefined()
  })

  it('accepts a payload with email and name', () => {
    const result = staffInviteSchema.safeParse({ email: 'staff@acmegifts.in', name: 'Priya Sharma' })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid email address', () => {
    const cases = ['notanemail', 'missing@', '@nodomain.com', 'a b@test.com']
    for (const email of cases) {
      expect(staffInviteSchema.safeParse({ email }).success).toBe(false)
    }
  })

  it('rejects empty email', () => {
    expect(staffInviteSchema.safeParse({ email: '' }).success).toBe(false)
  })

  it('rejects email over 255 characters', () => {
    const longEmail = `${'a'.repeat(244)}@example.com`
    expect(staffInviteSchema.safeParse({ email: longEmail }).success).toBe(false)
  })

  it('trims leading/trailing whitespace from email', () => {
    const result = staffInviteSchema.safeParse({ email: '  staff@test.in  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe('staff@test.in')
  })

  it('rejects an empty name when provided', () => {
    expect(staffInviteSchema.safeParse({ email: 'staff@test.in', name: '' }).success).toBe(false)
  })

  it('rejects a name over 255 characters', () => {
    expect(staffInviteSchema.safeParse({ email: 'staff@test.in', name: 'x'.repeat(256) }).success).toBe(false)
  })

  it('rejects unknown keys (strict schema)', () => {
    expect(staffInviteSchema.safeParse({ email: 'staff@test.in', organizationId: 'should-be-stripped' }).success).toBe(false)
  })
})
