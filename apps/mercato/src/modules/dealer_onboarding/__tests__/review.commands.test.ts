import { describe, expect, it, jest } from '@jest/globals'
import type { DealerProfile } from '../data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

jest.mock('@open-mercato/shared/lib/commands/scope', () => ({
  ensureTenantScope: () => undefined,
  ensureOrganizationScope: () => undefined,
}))

import { executeApprove, executeReject } from '../commands/review'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID    = 'bbbbbbbb-0000-4000-a000-000000000002'
const PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'
const VALID_UUID = 'dddddddd-0000-4000-a000-000000000004'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<DealerProfile> = {}): DealerProfile {
  return {
    id: PROFILE_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    businessName: 'Test Dealer',
    contactEmail: 'dealer@test.in',
    phone: '+91 99999 00000',
    gstin: null,
    pan: null,
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

function makeEm() {
  return {
    findOne: jest.fn(),
    flush: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
}

function makeCommandBus() {
  return {
    execute: jest.fn<() => Promise<{ result: Record<string, unknown> }>>().mockResolvedValue({ result: {} }),
  }
}

function makeCtx(em = makeEm(), commandBus = makeCommandBus()) {
  const container = {
    resolve: jest.fn((id: string) => {
      if (id === 'em') return em
      if (id === 'commandBus') return commandBus
      throw new Error(`Unknown service: ${id}`)
    }),
  }
  return {
    container,
    auth: { sub: 'admin-1', tenantId: TENANT_ID, orgId: ORG_ID, isSuperAdmin: true },
    organizationScope: null,
    selectedOrganizationId: ORG_ID,
    organizationIds: [ORG_ID],
    systemActor: false,
  } as unknown as import('@open-mercato/shared/lib/commands').CommandRuntimeContext
}

// ---------------------------------------------------------------------------
// executeApprove
// ---------------------------------------------------------------------------

describe('executeApprove', () => {
  it('throws ZodError for an invalid UUID', async () => {
    const ctx = makeCtx()
    await expect(executeApprove({ id: 'not-a-uuid' }, ctx)).rejects.toThrow()
  })

  it('throws when the profile is not found', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(null)
    const ctx = makeCtx(em)
    await expect(executeApprove({ id: VALID_UUID }, ctx)).rejects.toThrow('Dealer profile not found')
  })

  it('throws when the profile is already approved', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'approved' }))
    const ctx = makeCtx(em)
    await expect(executeApprove({ id: VALID_UUID }, ctx)).rejects.toThrow('This dealer is already approved')
  })

  it('throws when the profile is pending_verification (not under_review)', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'pending_verification' }))
    const ctx = makeCtx(em)
    await expect(executeApprove({ id: VALID_UUID }, ctx)).rejects.toThrow('Only applications under review can be approved')
  })

  it('throws when the profile is rejected (not under_review)', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'rejected' }))
    const ctx = makeCtx(em)
    await expect(executeApprove({ id: VALID_UUID }, ctx)).rejects.toThrow('Only applications under review can be approved')
  })

  it('approves an under_review profile and calls directory.organizations.update', async () => {
    const em = makeEm()
    const commandBus = makeCommandBus()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))

    const ctx = makeCtx(em, commandBus)
    const result = await executeApprove({ id: VALID_UUID }, ctx)

    expect(result.kycStatus).toBe('approved')
    expect(result.approvedAt).toBeInstanceOf(Date)
    expect(result.rejectionReason).toBeNull()
    expect(result.reviewedBy).toBe('admin-1')
    expect(em.flush).toHaveBeenCalledTimes(1)
    expect(commandBus.execute).toHaveBeenCalledWith(
      'directory.organizations.update',
      expect.objectContaining({ input: expect.objectContaining({ isActive: true }) }),
    )
  })

  // Approval deliberately never touches `dealer:owner`'s RoleAcl (no
  // auth.role-acl.update call at all) — see the comment on DEALER_OWNER_ROLE
  // (lib/constants.ts) for why. `dealer:owner` is one shared, tenant-wide
  // role; a prior version of this flow tried to org-restrict it per approval,
  // which denied any still-pending dealer access to their own data the
  // moment a different dealer in the tenant was approved first. Isolation is
  // enforced entirely at the command/data layer (every dealer-facing command
  // scopes its queries by the caller's own organizationId), not here.
  it('never calls auth.role-acl.update', async () => {
    const em = makeEm()
    const commandBus = makeCommandBus()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))

    const ctx = makeCtx(em, commandBus)
    await executeApprove({ id: VALID_UUID }, ctx)

    const calls = (commandBus.execute as jest.Mock).mock.calls
    const roleAclCall = calls.find((c) => c[0] === 'auth.role-acl.update')
    expect(roleAclCall).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// executeReject
// ---------------------------------------------------------------------------

describe('executeReject', () => {
  it('throws ZodError when reason is missing', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile())
    const ctx = makeCtx(em)
    await expect(executeReject({ id: VALID_UUID }, ctx)).rejects.toThrow()
  })

  it('throws ZodError when reason is empty', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile())
    const ctx = makeCtx(em)
    await expect(executeReject({ id: VALID_UUID, reason: '' }, ctx)).rejects.toThrow()
  })

  it('throws when the profile is not found', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(null)
    const ctx = makeCtx(em)
    await expect(executeReject({ id: VALID_UUID, reason: 'Docs incomplete' }, ctx)).rejects.toThrow('Dealer profile not found')
  })

  it('throws when the profile is already rejected', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'rejected' }))
    const ctx = makeCtx(em)
    await expect(executeReject({ id: VALID_UUID, reason: 'Docs incomplete' }, ctx)).rejects.toThrow('This dealer is already rejected')
  })

  it('throws when the profile is approved', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'approved' }))
    const ctx = makeCtx(em)
    await expect(executeReject({ id: VALID_UUID, reason: 'Fraud' }, ctx)).rejects.toThrow('An approved dealer cannot be rejected')
  })

  it('rejects a pending_verification application (no guard blocks this)', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'pending_verification' }))
    const ctx = makeCtx(em)
    const result = await executeReject({ id: VALID_UUID, reason: 'Invalid documents' }, ctx)
    expect(result.kycStatus).toBe('rejected')
    expect(result.rejectionReason).toBe('Invalid documents')
  })

  it('rejects an under_review application and persists the reason', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
    const ctx = makeCtx(em)
    const result = await executeReject({ id: VALID_UUID, reason: 'Docs incomplete' }, ctx)

    expect(result.kycStatus).toBe('rejected')
    expect(result.rejectionReason).toBe('Docs incomplete')
    expect(result.reviewedBy).toBe('admin-1')
    expect(result.reviewedAt).toBeInstanceOf(Date)
    expect(em.flush).toHaveBeenCalledTimes(1)
  })
})
