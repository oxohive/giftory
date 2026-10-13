import { describe, expect, it, jest } from '@jest/globals'
import type { DealerProfile } from '../data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

jest.mock('@open-mercato/shared/lib/commands/scope', () => ({
  ensureTenantScope: () => undefined,
  ensureOrganizationScope: () => undefined,
}))

// Dynamic import inside scopeDealerRoleToOrg — mock it so the entity
// constructor is available without a real DB connection.
jest.mock('@open-mercato/core/modules/auth/data/entities', () => ({
  Role: class MockRole {},
  RoleAcl: class MockRoleAcl {},
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
    // findProfileById → profile; Role lookup → null (scopeDealerRoleToOrg exits early)
    em.findOne
      .mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
      .mockResolvedValueOnce(null)

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

  it('does not call auth.role-acl.update when the dealer:owner role does not exist', async () => {
    const em = makeEm()
    const commandBus = makeCommandBus()
    em.findOne
      .mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
      .mockResolvedValueOnce(null) // Role not found

    const ctx = makeCtx(em, commandBus)
    await executeApprove({ id: VALID_UUID }, ctx)

    const calls = (commandBus.execute as jest.Mock).mock.calls
    const roleAclCall = calls.find((c) => c[0] === 'auth.role-acl.update')
    expect(roleAclCall).toBeUndefined()
  })

  it('calls auth.role-acl.update when role is found and org is not yet in ACL', async () => {
    const em = makeEm()
    const commandBus = makeCommandBus()
    em.findOne
      .mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
      .mockResolvedValueOnce({ id: 'role-1', name: 'dealer:owner' }) // Role found
      .mockResolvedValueOnce({ organizationsJson: [] })               // RoleAcl — org not included

    const ctx = makeCtx(em, commandBus)
    await executeApprove({ id: VALID_UUID }, ctx)

    const calls = (commandBus.execute as jest.Mock).mock.calls
    const roleAclCall = calls.find((c) => c[0] === 'auth.role-acl.update')
    expect(roleAclCall).toBeDefined()
    expect(roleAclCall![1].input.organizations).toContain(ORG_ID)
  })

  it('skips auth.role-acl.update only when BOTH the org and every required feature are already present', async () => {
    const em = makeEm()
    const commandBus = makeCommandBus()
    em.findOne
      .mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
      .mockResolvedValueOnce({ id: 'role-1', name: 'dealer:owner' })
      .mockResolvedValueOnce({
        organizationsJson: [ORG_ID], // Org already present
        featuresJson: [
          'dealer_onboarding.view_own',
          'dealer_onboarding.submit',
          'dealer_orders.dealer_access',
          'commissions.dealer_access',
          'payouts.dealer_access',
          'dealer_org.view', // an unrelated grant that must never be touched
        ],
      })

    const ctx = makeCtx(em, commandBus)
    await executeApprove({ id: VALID_UUID }, ctx)

    const calls = (commandBus.execute as jest.Mock).mock.calls
    const roleAclCall = calls.find((c) => c[0] === 'auth.role-acl.update')
    expect(roleAclCall).toBeUndefined()
  })

  // ── Gap 1 + Gap 2 regression coverage ────────────────────────────────────
  // https://.../tasks/phase-2-ui/API-CONTRACTS.md#critical-backend-gaps

  it('[Gap 2] merges — never replaces — the role ACL: existing features and orgs survive the write', async () => {
    const em = makeEm()
    const commandBus = makeCommandBus()
    const OTHER_ORG_ID = 'eeeeeeee-0000-4000-a000-000000000005'
    em.findOne
      .mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
      .mockResolvedValueOnce({ id: 'role-1', name: 'dealer:owner' })
      .mockResolvedValueOnce({
        // Simulates a tenant where another dealer owner was already approved
        // and dealer_org_rbac's tenant-creation seeding granted dealer_org.*.
        organizationsJson: [OTHER_ORG_ID],
        featuresJson: ['dealer_onboarding.view_own', 'dealer_onboarding.submit', 'dealer_org.view', 'dealer_org.manage_capabilities', 'dealer_org.manage_staff'],
      })

    const ctx = makeCtx(em, commandBus)
    await executeApprove({ id: VALID_UUID }, ctx)

    const calls = (commandBus.execute as jest.Mock).mock.calls
    const roleAclCall = calls.find((c) => c[0] === 'auth.role-acl.update')
    expect(roleAclCall).toBeDefined()
    const input = roleAclCall![1].input as { organizations: string[]; features: string[] }

    // The other dealer's org scope must survive — this is the exact
    // "approving dealer B locks out dealer A" regression.
    expect(input.organizations).toContain(OTHER_ORG_ID)
    expect(input.organizations).toContain(ORG_ID)

    // dealer_org_rbac's grants must survive — this is the exact
    // "approving any dealer wipes dealer_org.* for every owner" regression.
    expect(input.features).toContain('dealer_org.view')
    expect(input.features).toContain('dealer_org.manage_capabilities')
    expect(input.features).toContain('dealer_org.manage_staff')
  })

  it('[Gap 1] grants dealer_orders.dealer_access, commissions.dealer_access and payouts.dealer_access on approval', async () => {
    const em = makeEm()
    const commandBus = makeCommandBus()
    em.findOne
      .mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
      .mockResolvedValueOnce({ id: 'role-1', name: 'dealer:owner' })
      .mockResolvedValueOnce({ organizationsJson: [], featuresJson: [] })

    const ctx = makeCtx(em, commandBus)
    await executeApprove({ id: VALID_UUID }, ctx)

    const calls = (commandBus.execute as jest.Mock).mock.calls
    const roleAclCall = calls.find((c) => c[0] === 'auth.role-acl.update')
    expect(roleAclCall).toBeDefined()
    const features = (roleAclCall![1].input as { features: string[] }).features
    expect(features).toContain('dealer_orders.dealer_access')
    expect(features).toContain('commissions.dealer_access')
    expect(features).toContain('payouts.dealer_access')
    // De-duplicated, not merely concatenated.
    expect(features.length).toBe(new Set(features).size)
  })

  it('[Gap 1] re-asserts the dealer_access grants even when the org is already scoped in (heals a tenant whose setup.ts grants predate the fix)', async () => {
    const em = makeEm()
    const commandBus = makeCommandBus()
    em.findOne
      .mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
      .mockResolvedValueOnce({ id: 'role-1', name: 'dealer:owner' })
      .mockResolvedValueOnce({
        organizationsJson: [ORG_ID], // org already scoped — pre-fix state
        featuresJson: ['dealer_onboarding.view_own', 'dealer_onboarding.submit'], // the pre-fix hardcoded replace value
      })

    const ctx = makeCtx(em, commandBus)
    await executeApprove({ id: VALID_UUID }, ctx)

    const calls = (commandBus.execute as jest.Mock).mock.calls
    const roleAclCall = calls.find((c) => c[0] === 'auth.role-acl.update')
    expect(roleAclCall).toBeDefined()
    const input = roleAclCall![1].input as { organizations: string[]; features: string[] }
    expect(input.organizations).toEqual([ORG_ID])
    expect(input.features).toContain('dealer_orders.dealer_access')
    expect(input.features).toContain('commissions.dealer_access')
    expect(input.features).toContain('payouts.dealer_access')
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
