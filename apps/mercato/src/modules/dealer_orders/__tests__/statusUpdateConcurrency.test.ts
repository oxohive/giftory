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

jest.mock('@/modules/dealer_onboarding/data/entities', () => ({
  DealerProfile: class MockDealerProfile {},
}))

import { executeUpdateStatus } from '../commands/assignments'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const DEALER_PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'
const ASSIGNMENT_ID = 'dddddddd-0000-4000-a000-000000000004'
const CURRENT_UPDATED_AT = new Date('2026-01-10T10:00:00.000Z')

function makeDealerProfile(): DealerProfile {
  return { id: DEALER_PROFILE_ID, organizationId: ORG_ID, tenantId: TENANT_ID, kycStatus: 'approved', deletedAt: null } as DealerProfile
}

function makeAssignment(overrides: Partial<DealerOrderAssignment> = {}): DealerOrderAssignment {
  return {
    id: ASSIGNMENT_ID,
    orderId: 'order-1',
    dealerProfileId: DEALER_PROFILE_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    assignedBy: 'admin-1',
    assignedAt: new Date('2026-01-01'),
    requiredBy: '2026-02-01',
    status: 'assigned',
    statusUpdatedAt: new Date('2026-01-01'),
    statusNote: null,
    cancelledReason: null,
    updatedAt: CURRENT_UPDATED_AT,
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

describe('executeUpdateStatus — optimistic concurrency (editable record convention)', () => {
  it('applies the update when the caller omits updatedAt (backward compatible)', async () => {
    const em = { findOne: jest.fn() }
    const de = { updateOrmEntity: jest.fn() }
    em.findOne.mockResolvedValueOnce(makeDealerProfile()).mockResolvedValueOnce(makeAssignment())
    de.updateOrmEntity.mockResolvedValueOnce(makeAssignment({ status: 'acknowledged' }))

    await executeUpdateStatus({ assignmentId: ASSIGNMENT_ID, status: 'acknowledged' }, makeCtx(em, de))
    expect(de.updateOrmEntity).toHaveBeenCalledTimes(1)
  })

  it('applies the update when the caller sends the CURRENT updatedAt', async () => {
    const em = { findOne: jest.fn() }
    const de = { updateOrmEntity: jest.fn() }
    em.findOne.mockResolvedValueOnce(makeDealerProfile()).mockResolvedValueOnce(makeAssignment())
    de.updateOrmEntity.mockResolvedValueOnce(makeAssignment({ status: 'acknowledged' }))

    await executeUpdateStatus(
      { assignmentId: ASSIGNMENT_ID, status: 'acknowledged', updatedAt: CURRENT_UPDATED_AT.toISOString() },
      makeCtx(em, de),
    )
    expect(de.updateOrmEntity).toHaveBeenCalledTimes(1)
  })

  it('returns 409 and never writes when the caller sends a STALE updatedAt', async () => {
    const em = { findOne: jest.fn() }
    const de = { updateOrmEntity: jest.fn() }
    em.findOne.mockResolvedValueOnce(makeDealerProfile()).mockResolvedValueOnce(makeAssignment())

    const stale = new Date(CURRENT_UPDATED_AT.getTime() - 60_000).toISOString()
    const err = await executeUpdateStatus(
      { assignmentId: ASSIGNMENT_ID, status: 'acknowledged', updatedAt: stale },
      makeCtx(em, de),
    ).catch((e) => e)

    expect((err as { status?: number }).status).toBe(409)
    expect(de.updateOrmEntity).not.toHaveBeenCalled()
  })
})
