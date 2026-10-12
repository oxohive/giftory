import { describe, expect, it, jest } from '@jest/globals'
import type { DealerProfile } from '@/modules/dealer_onboarding/data/entities'
import type { DealerCapability } from '../data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

// dealer_org_rbac/commands/shared.ts uses dynamic import for DealerProfile —
// provide a concrete class so em.findOne receives a real constructor.
jest.mock('@/modules/dealer_onboarding/data/entities', () => ({
  DealerProfile: class MockDealerProfile {},
}))

import { executeCapabilitiesUpsert } from '../commands/capabilities'
import { executeStaffInvite } from '../commands/staff'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID  = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID     = 'bbbbbbbb-0000-4000-a000-000000000002'
const PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'
const CAP_ID     = 'dddddddd-0000-4000-a000-000000000004'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<DealerProfile> = {}): DealerProfile {
  return {
    id: PROFILE_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    businessName: 'Test Dealer',
    kycStatus: 'approved',
    ...overrides,
  } as DealerProfile
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
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  } as DealerCapability
}

function makeEm() {
  return {
    findOne: jest.fn(),
    create: jest.fn((
      _entity: unknown,
      data: Record<string, unknown>,
    ) => ({ id: 'new-cap-id', updatedAt: new Date(), ...data }) as unknown as DealerCapability),
    flush: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
}

function makeCommandBus() {
  return {
    execute: jest.fn<() => Promise<{ result: { id: string } }>>().mockResolvedValue({ result: { id: 'new-user-id' } }),
  }
}

function makeCtx(em = makeEm(), commandBus = makeCommandBus(), authOverrides: Record<string, unknown> = {}) {
  const container = {
    resolve: jest.fn((id: string) => {
      if (id === 'em') return em
      if (id === 'commandBus') return commandBus
      throw new Error(`Unknown service: ${id}`)
    }),
  }
  return {
    container,
    auth: { sub: 'dealer-owner-1', tenantId: TENANT_ID, orgId: ORG_ID, isSuperAdmin: false, ...authOverrides },
    organizationScope: null,
    selectedOrganizationId: ORG_ID,
    organizationIds: [ORG_ID],
    systemActor: false,
  } as unknown as import('@open-mercato/shared/lib/commands').CommandRuntimeContext
}

const VALID_PAYLOAD = {
  productTypeCodes: ['mug', 'tshirt'],
  printingMethods: ['sublimation' as const],
  maxDailyCapacity: 200,
  serviceableStates: ['IN-MH' as const],
  minOrderQty: 5,
}

// ---------------------------------------------------------------------------
// executeCapabilitiesUpsert
// ---------------------------------------------------------------------------

describe('executeCapabilitiesUpsert', () => {
  it('throws when tenantId is missing from context and input', async () => {
    const em = makeEm()
    const ctx = makeCtx(em, makeCommandBus(), { tenantId: undefined })
    // Cast to override auth for this guard test
    ;(ctx as unknown as Record<string, unknown>).auth = null
    await expect(executeCapabilitiesUpsert(VALID_PAYLOAD, ctx)).rejects.toThrow('Missing tenant scope')
  })

  it('admin path: throws when the profile is not found', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(null) // findProfileById → not found
    const ctx = makeCtx(em)
    await expect(
      executeCapabilitiesUpsert({ ...VALID_PAYLOAD, dealerProfileId: PROFILE_ID }, ctx),
    ).rejects.toThrow('Dealer not found')
  })

  it('admin path: throws when the profile is not approved', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
    const ctx = makeCtx(em)
    await expect(
      executeCapabilitiesUpsert({ ...VALID_PAYLOAD, dealerProfileId: PROFILE_ID }, ctx),
    ).rejects.toThrow('Dealer must be approved to set capabilities')
  })

  it('self-service: throws when orgId is missing from context', async () => {
    const em = makeEm()
    const ctx = makeCtx(em, makeCommandBus(), { orgId: undefined })
    // No dealerProfileId → takes self-service path which checks orgId
    await expect(executeCapabilitiesUpsert(VALID_PAYLOAD, ctx)).rejects.toThrow('Missing organization scope')
  })

  it('self-service: throws when no approved profile exists for the org', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(null) // findOwnProfile (kycStatus: approved filter) → not found
    const ctx = makeCtx(em)
    await expect(executeCapabilitiesUpsert(VALID_PAYLOAD, ctx)).rejects.toThrow('Dealer not found')
  })

  it('self-service: creates a new capability when none exists', async () => {
    const em = makeEm()
    // findOwnProfile → approved profile; findCapabilityByProfile → null
    em.findOne.mockResolvedValueOnce(makeProfile()).mockResolvedValueOnce(null)

    const ctx = makeCtx(em)
    const result = await executeCapabilitiesUpsert(VALID_PAYLOAD, ctx)

    expect(em.create).toHaveBeenCalledTimes(1)
    expect(em.flush).toHaveBeenCalledTimes(1)
    expect(result.productTypeCodes).toEqual(['mug', 'tshirt'])
    expect(result.minOrderQty).toBe(5)
  })

  it('self-service: updates an existing capability in place', async () => {
    const existing = makeCapability({ productTypeCodes: ['old'], minOrderQty: 1 })
    const em = makeEm()
    em.findOne
      .mockResolvedValueOnce(makeProfile())
      .mockResolvedValueOnce(existing)

    const ctx = makeCtx(em)
    const result = await executeCapabilitiesUpsert(VALID_PAYLOAD, ctx)

    expect(em.create).not.toHaveBeenCalled()
    expect(em.flush).toHaveBeenCalledTimes(1)
    expect(result.productTypeCodes).toEqual(['mug', 'tshirt'])
    expect(result.minOrderQty).toBe(5)
    expect(existing.productTypeCodes).toEqual(['mug', 'tshirt'])
  })

  it('admin path: creates capability for an approved dealer by profile ID', async () => {
    const em = makeEm()
    em.findOne
      .mockResolvedValueOnce(makeProfile({ kycStatus: 'approved' })) // findProfileById
      .mockResolvedValueOnce(null)                                    // no existing capability

    const ctx = makeCtx(em)
    const result = await executeCapabilitiesUpsert({ ...VALID_PAYLOAD, dealerProfileId: PROFILE_ID }, ctx)

    expect(em.create).toHaveBeenCalledTimes(1)
    expect(result.maxDailyCapacity).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// executeStaffInvite
// ---------------------------------------------------------------------------

describe('executeStaffInvite', () => {
  it('throws ZodError for an invalid email', async () => {
    const em = makeEm()
    const ctx = makeCtx(em)
    await expect(
      executeStaffInvite({ email: 'not-an-email' }, ctx),
    ).rejects.toThrow()
  })

  it('throws when tenantId is missing', async () => {
    const em = makeEm()
    const ctx = makeCtx(em, makeCommandBus(), { tenantId: undefined })
    ;(ctx as unknown as Record<string, unknown>).auth = null
    await expect(executeStaffInvite({ email: 'staff@test.in' }, ctx)).rejects.toThrow('Missing tenant scope')
  })

  it('throws when orgId is missing', async () => {
    const em = makeEm()
    const ctx = makeCtx(em, makeCommandBus(), { orgId: undefined })
    await expect(executeStaffInvite({ email: 'staff@test.in' }, ctx)).rejects.toThrow('Missing organization scope')
  })

  it('throws when no approved profile exists for the org', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(null) // findOwnProfile → not found
    const ctx = makeCtx(em)
    await expect(
      executeStaffInvite({ email: 'staff@test.in' }, ctx),
    ).rejects.toThrow('Dealer not found')
  })

  it('calls auth.users.create and returns userId + email on success', async () => {
    const em = makeEm()
    const commandBus = makeCommandBus()
    em.findOne.mockResolvedValueOnce(makeProfile()) // findOwnProfile → approved profile

    const ctx = makeCtx(em, commandBus)
    const result = await executeStaffInvite({ email: 'staff@acmegifts.in', name: 'Priya Sharma' }, ctx)

    expect(commandBus.execute).toHaveBeenCalledWith(
      'auth.users.create',
      expect.objectContaining({
        input: expect.objectContaining({
          email: 'staff@acmegifts.in',
          name: 'Priya Sharma',
          organizationId: ORG_ID,
          roles: ['dealer:staff'],
          sendInviteEmail: true,
          tenantId: TENANT_ID,
        }),
      }),
    )
    expect(result.userId).toBe('new-user-id')
    expect(result.email).toBe('staff@acmegifts.in')
  })

  it('works without an optional name', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile())
    const ctx = makeCtx(em)
    const result = await executeStaffInvite({ email: 'noname@test.in' }, ctx)
    expect(result.email).toBe('noname@test.in')
  })
})
