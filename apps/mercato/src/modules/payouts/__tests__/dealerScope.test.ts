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
// resolveOwnDealerProfileId (payouts) — Gap 3 fix. The most severe pre-fix
// instance of this gap: GET /dealer/ledger/balance *required* a caller-
// supplied dealerProfileId query param and never compared it against the
// session, so any authenticated dealer could read any other dealer's
// pending balance by changing one query string. This helper removes that
// caller-supplied value entirely.
// ---------------------------------------------------------------------------

describe('resolveOwnDealerProfileId (payouts)', () => {
  it('returns the id of the approved profile for the caller\'s own org + tenant', async () => {
    const em = makeEm(makeProfile())
    const result = await resolveOwnDealerProfileId(em as never, ORG_ID, TENANT_ID)
    expect(result).toBe(PROFILE_ID)
  })

  it('fails closed when no approved profile exists for the org', async () => {
    const em = makeEm(null)
    await expect(resolveOwnDealerProfileId(em as never, ORG_ID, TENANT_ID)).rejects.toThrow(
      'No approved dealer profile for this organization',
    )
  })

  it('scopes the lookup to the caller\'s own organizationId — never a caller-supplied one', async () => {
    const em = makeEm(makeProfile())
    await resolveOwnDealerProfileId(em as never, ORG_ID, TENANT_ID)
    expect(em.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ organizationId: ORG_ID, tenantId: TENANT_ID }))
  })
})
