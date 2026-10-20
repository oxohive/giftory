import { describe, expect, it, jest } from '@jest/globals'
import type { DealerProfile } from '@/modules/dealer_onboarding/data/entities'
import type { DealerCapability } from '../data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

jest.mock('@/modules/dealer_onboarding/data/entities', () => ({
  DealerProfile: class MockDealerProfile {},
}))

import { executeCapabilitiesUpsert } from '../commands/capabilities'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'
const CAP_ID = 'dddddddd-0000-4000-a000-000000000004'
const CURRENT_UPDATED_AT = new Date('2026-01-10T10:00:00.000Z')

function makeProfile(): DealerProfile {
  return { id: PROFILE_ID, organizationId: ORG_ID, tenantId: TENANT_ID, kycStatus: 'approved' } as DealerProfile
}

function makeCapability(overrides: Partial<DealerCapability> = {}): DealerCapability {
  return {
    id: CAP_ID,
    dealerProfileId: PROFILE_ID,
    tenantId: TENANT_ID,
    productTypeCodes: ['mug'],
    printingMethods: ['sublimation'],
    maxDailyCapacity: 100,
    serviceableStates: ['IN-MH'],
    minOrderQty: 1,
    updatedAt: CURRENT_UPDATED_AT,
    deletedAt: null,
    ...overrides,
  } as DealerCapability
}

function makeCtx(em: { findOne: jest.Mock; flush: jest.Mock }) {
  const container = { resolve: jest.fn((id: string) => (id === 'em' ? em : (() => { throw new Error(id) })())) }
  return {
    container,
    auth: { sub: 'dealer-owner-1', tenantId: TENANT_ID, orgId: ORG_ID, isSuperAdmin: false },
    organizationScope: null,
    selectedOrganizationId: ORG_ID,
    organizationIds: [ORG_ID],
    systemActor: false,
  } as unknown as import('@open-mercato/shared/lib/commands').CommandRuntimeContext
}

const BASE_PAYLOAD = {
  productTypeCodes: ['mug', 'tshirt'],
  printingMethods: ['sublimation' as const],
  maxDailyCapacity: 200,
  serviceableStates: ['IN-MH' as const],
  minOrderQty: 5,
}

describe('executeCapabilitiesUpsert — optimistic concurrency (editable record convention)', () => {
  it('proceeds with last-write-wins when the caller omits updatedAt (backward compatible)', async () => {
    const capability = makeCapability()
    const em = { findOne: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) }
    em.findOne.mockResolvedValueOnce(makeProfile()).mockResolvedValueOnce(capability)
    const ctx = makeCtx(em)

    await expect(executeCapabilitiesUpsert(BASE_PAYLOAD, ctx)).resolves.toMatchObject({
      productTypeCodes: BASE_PAYLOAD.productTypeCodes,
    })
  })

  it('applies the write when the caller sends the CURRENT updatedAt', async () => {
    const capability = makeCapability()
    const em = { findOne: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) }
    em.findOne.mockResolvedValueOnce(makeProfile()).mockResolvedValueOnce(capability)
    const ctx = makeCtx(em)

    await expect(
      executeCapabilitiesUpsert({ ...BASE_PAYLOAD, updatedAt: CURRENT_UPDATED_AT.toISOString() }, ctx),
    ).resolves.toMatchObject({ productTypeCodes: BASE_PAYLOAD.productTypeCodes })
    expect(em.flush).toHaveBeenCalledTimes(1)
  })

  it('returns 409 when the caller sends a STALE updatedAt — a concurrent edit already happened', async () => {
    const capability = makeCapability()
    const em = { findOne: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) }
    em.findOne.mockResolvedValueOnce(makeProfile()).mockResolvedValueOnce(capability)
    const ctx = makeCtx(em)

    const stale = new Date(CURRENT_UPDATED_AT.getTime() - 60_000).toISOString()
    const err = await executeCapabilitiesUpsert({ ...BASE_PAYLOAD, updatedAt: stale }, ctx).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as { status?: number }).status).toBe(409)
    // The stale write must never actually apply.
    expect(em.flush).not.toHaveBeenCalled()
    expect(capability.productTypeCodes).toEqual(['mug'])
  })

  it('never requires updatedAt on first-time creation (no existing row to conflict with)', async () => {
    const em = { findOne: jest.fn(), flush: jest.fn().mockResolvedValue(undefined), create: jest.fn((_e: unknown, data: Record<string, unknown>) => ({ id: 'new-cap', updatedAt: new Date(), ...data })) }
    em.findOne.mockResolvedValueOnce(makeProfile()).mockResolvedValueOnce(null)
    const ctx = makeCtx(em as never)

    await expect(
      executeCapabilitiesUpsert({ ...BASE_PAYLOAD, updatedAt: new Date('2020-01-01').toISOString() }, ctx),
    ).resolves.toMatchObject({ productTypeCodes: BASE_PAYLOAD.productTypeCodes })
  })
})
