import { describe, expect, it, jest } from '@jest/globals'
import type { DealerProfile } from '@/modules/dealer_onboarding/data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

// commands/shared.ts's resolveOwnDealerProfileId uses a dynamic import for
// DealerProfile — provide a concrete class so em.findOne receives a real
// constructor.
jest.mock('@/modules/dealer_onboarding/data/entities', () => ({
  DealerProfile: class MockDealerProfile {},
}))

import { resolveOwnDealerProfileId } from '../commands/shared'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'

function makeProfile(overrides: Partial<DealerProfile> = {}): DealerProfile {
  return {
    id: PROFILE_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    kycStatus: 'approved',
    deletedAt: null,
    ...overrides,
  } as DealerProfile
}

function makeEm(findOneResult: unknown) {
  return {
    findOne: jest.fn<() => Promise<unknown>>().mockResolvedValue(findOneResult),
  }
}

// ---------------------------------------------------------------------------
// resolveOwnDealerProfileId (commissions) — Gap 3 fix: the dealer calling
// GET /api/commissions/dealer/earnings[/:assignmentId] must never be able to
// supply or guess another dealer's dealerProfileId. Earnings are financial
// data — FEAT-009 restricts even dealer:staff of the SAME org from this
// endpoint (enforced separately via ACL, not by this helper), so this
// helper's only job is binding the lookup to the caller's own approved org.
// ---------------------------------------------------------------------------

describe('resolveOwnDealerProfileId (commissions)', () => {
  it('returns the id of the approved profile for the caller\'s own org + tenant', async () => {
    const em = makeEm(makeProfile())
    const result = await resolveOwnDealerProfileId(em as never, ORG_ID, TENANT_ID)
    expect(result).toBe(PROFILE_ID)
  })

  it('fails closed when no approved profile exists for the org (pending/rejected dealer)', async () => {
    const em = makeEm(null)
    await expect(resolveOwnDealerProfileId(em as never, ORG_ID, TENANT_ID)).rejects.toThrow(
      'No approved dealer profile for this organization',
    )
  })

  it('always queries by kycStatus: approved — never returns a pending/rejected profile\'s id', async () => {
    const em = makeEm(makeProfile())
    await resolveOwnDealerProfileId(em as never, ORG_ID, TENANT_ID)
    expect(em.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kycStatus: 'approved' }))
  })
})
