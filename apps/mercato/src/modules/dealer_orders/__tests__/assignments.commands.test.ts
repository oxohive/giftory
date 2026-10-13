import { describe, expect, it, jest } from '@jest/globals'
import type { DealerProfile } from '@/modules/dealer_onboarding/data/entities'
import type { DealerOrderAssignment } from '../data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

jest.mock('@open-mercato/shared/lib/commands/scope', () => ({
  ensureTenantScope: () => undefined,
  ensureOrganizationScope: () => undefined,
}))

// commands/shared.ts's resolveOwnDealerProfileId uses a dynamic import for
// DealerProfile — provide a concrete class so em.findOne receives a real
// constructor.
jest.mock('@/modules/dealer_onboarding/data/entities', () => ({
  DealerProfile: class MockDealerProfile {},
}))

import { executeUpdateStatus } from '../commands/assignments'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const OWN_DEALER_PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'
const ASSIGNMENT_ID = 'dddddddd-0000-4000-a000-000000000004'

function makeDealerProfile(overrides: Partial<DealerProfile> = {}): DealerProfile {
  return {
    id: OWN_DEALER_PROFILE_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    kycStatus: 'approved',
    deletedAt: null,
    ...overrides,
  } as DealerProfile
}

function makeAssignment(overrides: Partial<DealerOrderAssignment> = {}): DealerOrderAssignment {
  return {
    id: ASSIGNMENT_ID,
    orderId: 'order-1',
    dealerProfileId: OWN_DEALER_PROFILE_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    assignedBy: 'admin-1',
    assignedAt: new Date('2026-01-01'),
    requiredBy: '2026-02-01',
    status: 'assigned',
    statusUpdatedAt: new Date('2026-01-01'),
    statusNote: null,
    cancelledReason: null,
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  } as DealerOrderAssignment
}

function makeCtx(em: { findOne: jest.Mock }, de: { updateOrmEntity: jest.Mock }) {
  const container = {
    resolve: jest.fn((id: string) => {
      if (id === 'em') return em
      if (id === 'dataEngine') return de
      throw new Error(`Unknown service: ${id}`)
    }),
  }
  return {
    container,
    auth: { sub: 'dealer-user-1', tenantId: TENANT_ID, orgId: ORG_ID, isSuperAdmin: false },
    organizationScope: null,
    selectedOrganizationId: ORG_ID,
    organizationIds: [ORG_ID],
    systemActor: false,
  } as unknown as import('@open-mercato/shared/lib/commands').CommandRuntimeContext
}

// ---------------------------------------------------------------------------
// executeUpdateStatus — Gap 3 fix: the dealer-facing status-update command
// must derive dealerProfileId from the session and enforce it on BOTH the
// lookup and the write, not just the read route. Two dealers in the same
// tenant must not be able to mutate each other's assignments even when the
// attacker guesses a real assignment id.
// ---------------------------------------------------------------------------

describe('executeUpdateStatus', () => {
  it('derives dealerProfileId from session scope and includes it in the assignment lookup filter', async () => {
    const em = { findOne: jest.fn() }
    const de = { updateOrmEntity: jest.fn() }
    em.findOne
      .mockResolvedValueOnce(makeDealerProfile()) // resolveOwnDealerProfileId
      .mockResolvedValueOnce(makeAssignment({ status: 'assigned' })) // assignment lookup
    de.updateOrmEntity.mockResolvedValueOnce(makeAssignment({ status: 'acknowledged' }))

    const ctx = makeCtx(em, de)
    await executeUpdateStatus({ assignmentId: ASSIGNMENT_ID, status: 'acknowledged' }, ctx)

    expect(em.findOne).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ id: ASSIGNMENT_ID, tenantId: TENANT_ID, dealerProfileId: OWN_DEALER_PROFILE_ID }),
    )
    expect(de.updateOrmEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ASSIGNMENT_ID, dealerProfileId: OWN_DEALER_PROFILE_ID }),
      }),
    )
  })

  it('fails closed (not found) when the assignment belongs to a DIFFERENT dealer in the same tenant', async () => {
    const em = { findOne: jest.fn() }
    const de = { updateOrmEntity: jest.fn() }
    em.findOne
      .mockResolvedValueOnce(makeDealerProfile()) // caller's own profile resolves fine
      // A real DB would never return this row for the query above (it's
      // scoped to dealerProfileId: OWN_DEALER_PROFILE_ID) — simulate that by
      // returning null, exactly as another dealer's assignment would.
      .mockResolvedValueOnce(null)

    const ctx = makeCtx(em, de)
    await expect(
      executeUpdateStatus({ assignmentId: ASSIGNMENT_ID, status: 'acknowledged' }, ctx),
    ).rejects.toThrow('Assignment not found')
    expect(de.updateOrmEntity).not.toHaveBeenCalled()
  })

  it('fails closed when the caller has no approved dealer profile (pending/rejected dealer, or staff of one)', async () => {
    const em = { findOne: jest.fn() }
    const de = { updateOrmEntity: jest.fn() }
    em.findOne.mockResolvedValueOnce(null) // resolveOwnDealerProfileId finds nothing approved

    const ctx = makeCtx(em, de)
    await expect(
      executeUpdateStatus({ assignmentId: ASSIGNMENT_ID, status: 'acknowledged' }, ctx),
    ).rejects.toThrow('No approved dealer profile for this organization')
    // Must never reach the assignment lookup or the write.
    expect(em.findOne).toHaveBeenCalledTimes(1)
    expect(de.updateOrmEntity).not.toHaveBeenCalled()
  })

  it('rejects an invalid status transition even for the dealer\'s own assignment', async () => {
    const em = { findOne: jest.fn() }
    const de = { updateOrmEntity: jest.fn() }
    em.findOne
      .mockResolvedValueOnce(makeDealerProfile())
      .mockResolvedValueOnce(makeAssignment({ status: 'dispatched' })) // terminal — no transitions allowed

    const ctx = makeCtx(em, de)
    await expect(
      executeUpdateStatus({ assignmentId: ASSIGNMENT_ID, status: 'acknowledged' }, ctx),
    ).rejects.toThrow('Invalid status transition')
    expect(de.updateOrmEntity).not.toHaveBeenCalled()
  })
})
