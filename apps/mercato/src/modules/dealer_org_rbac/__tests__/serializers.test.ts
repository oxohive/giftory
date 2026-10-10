import { describe, expect, it } from '@jest/globals'
import { serializeCapabilities } from '../commands/shared'
import type { DealerCapability } from '../data/entities'

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-11T10:00:00.000Z')

function makeCapability(overrides: Partial<DealerCapability> = {}): DealerCapability {
  return {
    id: 'cap-uuid-1',
    dealerProfileId: 'profile-uuid-1',
    tenantId: 'tenant-uuid-1',
    productTypeCodes: ['mug', 'tshirt'],
    printingMethods: ['sublimation', 'dtg'],
    maxDailyCapacity: 200,
    serviceableStates: ['IN-MH', 'IN-KA'],
    minOrderQty: 5,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  } as DealerCapability
}

// ---------------------------------------------------------------------------
// serializeCapabilities
// ---------------------------------------------------------------------------

describe('serializeCapabilities', () => {
  it('returns empty defaults when passed null', () => {
    const result = serializeCapabilities(null)
    expect(result.productTypeCodes).toEqual([])
    expect(result.printingMethods).toEqual([])
    expect(result.maxDailyCapacity).toBe(0)
    expect(result.serviceableStates).toEqual([])
    expect(result.minOrderQty).toBe(1)
    expect(result.updatedAt).toBeNull()
    expect((result as Record<string, unknown>).id).toBeUndefined()
  })

  it('serializes a full capability record', () => {
    const cap = makeCapability()
    const result = serializeCapabilities(cap)

    expect(result.id).toBe('cap-uuid-1')
    expect(result.productTypeCodes).toEqual(['mug', 'tshirt'])
    expect(result.printingMethods).toEqual(['sublimation', 'dtg'])
    expect(result.maxDailyCapacity).toBe(200)
    expect(result.serviceableStates).toEqual(['IN-MH', 'IN-KA'])
    expect(result.minOrderQty).toBe(5)
  })

  it('serializes updatedAt as an ISO string', () => {
    const result = serializeCapabilities(makeCapability({ updatedAt: NOW }))
    expect(result.updatedAt).toBe('2026-10-11T10:00:00.000Z')
  })

  it('preserves empty arrays as-is (no null coercion)', () => {
    const cap = makeCapability({ productTypeCodes: [], printingMethods: [], serviceableStates: [] })
    const result = serializeCapabilities(cap)
    expect(result.productTypeCodes).toEqual([])
    expect(result.printingMethods).toEqual([])
    expect(result.serviceableStates).toEqual([])
  })

  it('does not include tenantId or dealerProfileId in the output', () => {
    const result = serializeCapabilities(makeCapability()) as Record<string, unknown>
    expect(result.tenantId).toBeUndefined()
    expect(result.dealerProfileId).toBeUndefined()
    expect(result.deletedAt).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })
})
