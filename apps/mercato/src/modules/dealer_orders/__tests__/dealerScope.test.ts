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
const OTHER_ORG_ID = 'ffffffff-0000-4000-a000-000000000006'
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
// resolveOwnDealerProfileId — Gap 3 fix: dealer identity is ALWAYS derived
// from the authenticated tenant + organization scope, never from a
// caller-supplied value. These tests exercise the fail-closed paths that the
// task's acceptance criteria call out explicitly: cross-tenant, anonymous
// (blocked earlier by requireAuth — not reachable here), inactive/pending
// dealer, and no profile for the org at all.
// ---------------------------------------------------------------------------

describe('resolveOwnDealerProfileId', () => {
  it('returns the id of the approved profile for the caller\'s own org + tenant', async () => {
    const em = makeEm(makeProfile())
    const result = await resolveOwnDealerProfileId(em as never, ORG_ID, TENANT_ID)
    expect(result).toBe(PROFILE_ID)
    expect(em.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: ORG_ID, tenantId: TENANT_ID, kycStatus: 'approved', deletedAt: null }),
    )
  })

  it('fails closed (throws, never returns a caller-supplied id) when no profile exists for the org', async () => {
    const em = makeEm(null)
    await expect(resolveOwnDealerProfileId(em as never, ORG_ID, TENANT_ID)).rejects.toThrow(
      'No approved dealer profile for this organization',
    )
  })

  it('fails closed for a pending/under-review dealer (query is scoped to kycStatus: approved)', async () => {
    // The mock em always honours the query filter implicitly in a real DB;
    // here we assert the filter itself demands kycStatus: 'approved' so a
    // pending profile would never match.
    const em = makeEm(null) // simulates: real DB found no *approved* row
    await expect(resolveOwnDealerProfileId(em as never, ORG_ID, TENANT_ID)).rejects.toThrow()
    expect(em.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kycStatus: 'approved' }))
  })

  it('never resolves a different org\'s profile — the lookup is always scoped to the caller\'s own organizationId', async () => {
    const em = makeEm(null)
    await expect(resolveOwnDealerProfileId(em as never, OTHER_ORG_ID, TENANT_ID)).rejects.toThrow()
    expect(em.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ organizationId: OTHER_ORG_ID }))
  })
})
