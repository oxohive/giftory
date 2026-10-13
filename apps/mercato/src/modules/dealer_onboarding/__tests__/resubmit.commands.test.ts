import { describe, expect, it, jest } from '@jest/globals'
import type { DealerProfile } from '../data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

jest.mock('@open-mercato/shared/lib/commands/scope', () => ({
  ensureTenantScope: () => undefined,
  ensureOrganizationScope: () => undefined,
}))

import { executeResubmit } from '../commands/resubmit'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID  = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID     = 'bbbbbbbb-0000-4000-a000-000000000002'
const PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<DealerProfile> = {}): DealerProfile {
  return {
    id: PROFILE_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    businessName: 'Original Name',
    contactEmail: 'original@dealer.in',
    phone: '+91 99999 00000',
    gstin: '22AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    businessType: 'pvt_ltd',
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
    kycStatus: 'rejected',
    rejectionReason: 'Docs incomplete',
    reviewedBy: 'admin-1',
    reviewedAt: new Date('2026-06-01'),
    approvedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
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

function makeCtx(em = makeEm()) {
  const container = {
    resolve: jest.fn((id: string) => {
      if (id === 'em') return em
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
// executeResubmit
// ---------------------------------------------------------------------------

describe('executeResubmit', () => {
  it('throws when the dealer profile is not found', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(null)
    const ctx = makeCtx(em)
    await expect(executeResubmit({}, ctx)).rejects.toThrow('Dealer profile not found')
  })

  it('throws when the profile is pending_verification (not rejected)', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'pending_verification' }))
    const ctx = makeCtx(em)
    await expect(executeResubmit({}, ctx)).rejects.toThrow('Only rejected applications can be resubmitted')
  })

  it('throws when the profile is under_review', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
    const ctx = makeCtx(em)
    await expect(executeResubmit({}, ctx)).rejects.toThrow('Only rejected applications can be resubmitted')
  })

  it('throws when the profile is approved', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'approved' }))
    const ctx = makeCtx(em)
    await expect(executeResubmit({}, ctx)).rejects.toThrow('Only rejected applications can be resubmitted')
  })

  it('advances status to under_review and clears rejectionReason on empty payload', async () => {
    const profile = makeProfile({ kycStatus: 'rejected', rejectionReason: 'Docs incomplete' })
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(profile)
    const ctx = makeCtx(em)

    const result = await executeResubmit({}, ctx)

    expect(result.kycStatus).toBe('under_review')
    expect(result.rejectionReason).toBeNull()
    expect(em.flush).toHaveBeenCalledTimes(1)
  })

  it('updates only the fields that are provided (partial update)', async () => {
    const profile = makeProfile({ kycStatus: 'rejected' })
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(profile)
    const ctx = makeCtx(em)

    await executeResubmit({ businessName: 'New Name' }, ctx)

    expect(profile.businessName).toBe('New Name')
    expect(profile.contactEmail).toBe('original@dealer.in') // unchanged
    expect(profile.phone).toBe('+91 99999 00000')           // unchanged
  })

  it('updates all provided fields on resubmit', async () => {
    const profile = makeProfile({ kycStatus: 'rejected' })
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(profile)
    const ctx = makeCtx(em)

    await executeResubmit({
      businessName: 'Updated Corp',
      contactEmail: 'new@dealer.in',
      phone: '+91 88888 11111',
      city: 'Delhi',
      state: 'DL',
      pincode: '110001',
    }, ctx)

    expect(profile.businessName).toBe('Updated Corp')
    expect(profile.contactEmail).toBe('new@dealer.in')
    expect(profile.phone).toBe('+91 88888 11111')
    expect(profile.city).toBe('Delhi')
    expect(profile.state).toBe('DL')
    expect(profile.pincode).toBe('110001')
    expect(profile.kycStatus).toBe('under_review')
  })

  it('sets updatedAt to a recent timestamp', async () => {
    const before = new Date()
    const profile = makeProfile({ kycStatus: 'rejected' })
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(profile)
    const ctx = makeCtx(em)

    await executeResubmit({}, ctx)

    expect(profile.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})
