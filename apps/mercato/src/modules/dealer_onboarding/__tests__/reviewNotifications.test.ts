import { describe, expect, it, jest } from '@jest/globals'
import type { DealerProfile } from '../data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

jest.mock('@open-mercato/shared/lib/commands/scope', () => ({
  ensureTenantScope: () => undefined,
  ensureOrganizationScope: () => undefined,
}))

jest.mock('@open-mercato/core/modules/auth/data/entities', () => ({
  Role: class MockRole {},
  RoleAcl: class MockRoleAcl {},
}))

const emitMock = jest.fn()
jest.mock('../events', () => ({
  __esModule: true,
  default: { emit: emitMock },
}))

import { executeApprove, executeReject } from '../commands/review'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'
const CONTACT_EMAIL = 'owner@dealer.in'

function makeProfile(overrides: Partial<DealerProfile> = {}): DealerProfile {
  return {
    id: PROFILE_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    businessName: 'Test Dealer',
    contactEmail: CONTACT_EMAIL,
    phone: '+91 99999 00000',
    businessType: 'pvt_ltd',
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
    kycStatus: 'under_review',
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    approvedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  } as DealerProfile
}

function makeCtx(profile: DealerProfile) {
  const em = {
    findOne: jest.fn().mockResolvedValue({ ...profile }),
    flush: jest.fn().mockResolvedValue(undefined),
  }
  const commandBus = { execute: jest.fn().mockResolvedValue({ result: {} }) }
  const container = {
    resolve: jest.fn((id: string) => {
      if (id === 'em') return em
      if (id === 'commandBus') return commandBus
      throw new Error(`Unknown service: ${id}`)
    }),
  }
  return {
    container,
    auth: { sub: 'admin-1', tenantId: TENANT_ID, orgId: ORG_ID, isSuperAdmin: false },
    organizationScope: null,
    selectedOrganizationId: ORG_ID,
    organizationIds: [ORG_ID],
    systemActor: false,
  } as unknown as import('@open-mercato/shared/lib/commands').CommandRuntimeContext
}

describe('review command — approval/rejection notification events', () => {
  it('emits dealer_onboarding.profile.approved with the dealer\'s contact email on approval', async () => {
    emitMock.mockClear()
    const ctx = makeCtx(makeProfile({ kycStatus: 'under_review' }))
    await executeApprove({ id: PROFILE_ID }, ctx)

    expect(emitMock).toHaveBeenCalledWith(
      'dealer_onboarding.profile.approved',
      expect.objectContaining({ id: PROFILE_ID, tenantId: TENANT_ID, organizationId: ORG_ID, contactEmail: CONTACT_EMAIL }),
    )
  })

  it('emits dealer_onboarding.profile.rejected with the reason and contact email on rejection', async () => {
    emitMock.mockClear()
    const ctx = makeCtx(makeProfile({ kycStatus: 'under_review' }))
    await executeReject({ id: PROFILE_ID, reason: 'GSTIN document illegible' }, ctx)

    expect(emitMock).toHaveBeenCalledWith(
      'dealer_onboarding.profile.rejected',
      expect.objectContaining({
        id: PROFILE_ID,
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        contactEmail: CONTACT_EMAIL,
        reason: 'GSTIN document illegible',
      }),
    )
  })

  it('never emits an approval event when approval is rejected by the status guard', async () => {
    emitMock.mockClear()
    const ctx = makeCtx(makeProfile({ kycStatus: 'approved' })) // already approved — guard throws
    await expect(executeApprove({ id: PROFILE_ID }, ctx)).rejects.toThrow()
    expect(emitMock).not.toHaveBeenCalled()
  })
})
