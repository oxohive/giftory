import { describe, expect, it } from '@jest/globals'
import { capabilitiesUpsertSchema } from '../../data/validators'
import { PRINTING_METHODS, INDIAN_STATE_CODES } from '../../lib/constants'
import { buildCapabilitiesPayload, summarizeCapabilities, type CapabilitiesFormValues } from '../capabilitiesPayload'

/**
 * These tests parse `buildCapabilitiesPayload`'s output through the REAL
 * `capabilitiesUpsertSchema` (the exact schema the
 * `PUT /api/dealer_org_rbac/admin/dealers/{id}/capabilities` route
 * validates against) — not a hand-mirrored copy of its shape — so a drift
 * between what the capability form sends and what the server actually
 * accepts fails here first.
 */
describe('buildCapabilitiesPayload', () => {
  const validValues: CapabilitiesFormValues = {
    productTypeCodes: ['mug', 'photo-frame'],
    printingMethods: [PRINTING_METHODS[0], PRINTING_METHODS[1]],
    maxDailyCapacity: 50,
    serviceableStates: [INDIAN_STATE_CODES[0], INDIAN_STATE_CODES[1]],
    minOrderQty: 5,
  }

  it('produces a payload the real schema accepts, with no updatedAt when none was fetched', () => {
    const payload = buildCapabilitiesPayload(validValues, null)
    expect(payload.updatedAt).toBeUndefined()
    const parsed = capabilitiesUpsertSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
  })

  it('attaches updatedAt for the optimistic-concurrency check when a prior value exists', () => {
    const lastUpdatedAt = '2026-01-01T00:00:00.000Z'
    const payload = buildCapabilitiesPayload(validValues, lastUpdatedAt)
    expect(payload.updatedAt).toBe(lastUpdatedAt)
    const parsed = capabilitiesUpsertSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
  })

  it('never includes any key outside the schema\'s strict shape', () => {
    const payload = buildCapabilitiesPayload(validValues, null)
    expect(Object.keys(payload).sort()).toEqual(
      ['maxDailyCapacity', 'minOrderQty', 'printingMethods', 'productTypeCodes', 'serviceableStates'].sort(),
    )
  })

  it('the real schema rejects a printing method outside PRINTING_METHODS — the form must never offer one', () => {
    const payload = buildCapabilitiesPayload({ ...validValues, printingMethods: ['screen_print'] }, null)
    const parsed = capabilitiesUpsertSchema.safeParse(payload)
    expect(parsed.success).toBe(false)
  })

  it('the real schema rejects a serviceable state outside INDIAN_STATE_CODES — the form must never offer one', () => {
    const payload = buildCapabilitiesPayload({ ...validValues, serviceableStates: ['XX-ZZ'] }, null)
    const parsed = capabilitiesUpsertSchema.safeParse(payload)
    expect(parsed.success).toBe(false)
  })

  it('the real schema rejects maxDailyCapacity/minOrderQty out of their real bounds', () => {
    expect(capabilitiesUpsertSchema.safeParse(buildCapabilitiesPayload({ ...validValues, maxDailyCapacity: -1 }, null)).success).toBe(false)
    expect(capabilitiesUpsertSchema.safeParse(buildCapabilitiesPayload({ ...validValues, minOrderQty: 0 }, null)).success).toBe(false)
  })

  it('accepts free-text productTypeCodes — there is no canonical registry to validate against', () => {
    const payload = buildCapabilitiesPayload({ ...validValues, productTypeCodes: ['anything-goes', 'another-one'] }, null)
    expect(capabilitiesUpsertSchema.safeParse(payload).success).toBe(true)
  })
})

describe('summarizeCapabilities', () => {
  it('returns null for a missing capabilities object', () => {
    expect(summarizeCapabilities(null)).toBeNull()
    expect(summarizeCapabilities(undefined)).toBeNull()
  })

  it('counts product types and printing methods and carries max daily capacity through', () => {
    expect(summarizeCapabilities({
      productTypeCodes: ['mug', 'photo-frame', 'tote-bag'],
      printingMethods: [PRINTING_METHODS[0]],
      maxDailyCapacity: 42,
    })).toEqual({ productTypeCount: 3, printingMethodCount: 1, maxDailyCapacity: 42 })
  })
})
