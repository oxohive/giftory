import { describe, expect, it, jest } from '@jest/globals'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

// resolveOwnDealerProfileId dynamically imports DealerProfile — provide a
// concrete class so em.findOne receives a real constructor, same precedent
// as dealerScope.test.ts.
jest.mock('@/modules/dealer_onboarding/data/entities', () => ({
  DealerProfile: class MockDealerProfile {},
}))

import { computeDealerDashboard } from '../lib/dashboard'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'

function makeEm(aggregateRow: Record<string, unknown>) {
  const execute = jest.fn<() => Promise<Array<Record<string, unknown>>>>().mockResolvedValue([aggregateRow])
  return {
    findOne: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      id: PROFILE_ID,
      organizationId: ORG_ID,
      tenantId: TENANT_ID,
      kycStatus: 'approved',
      deletedAt: null,
    }),
    getConnection: () => ({ execute }),
    __execute: execute,
  }
}

describe('computeDealerDashboard', () => {
  it('computes aggregates with a single SQL query scoped to the caller\'s own dealer profile — never a page sum', async () => {
    const em = makeEm({ pending_acknowledgment: '250', in_production: '12', dispatched_this_week: '4' })
    const now = new Date('2026-01-08T12:00:00.000Z')

    const result = await computeDealerDashboard(em as never, ORG_ID, TENANT_ID, now)

    // The counts came from a single query result — a value larger than any
    // single page (default pageSize is 25, max 100) proves this isn't a
    // client-side sum over `GET /dealer/orders` pages.
    expect(result.pendingAcknowledgment).toBe(250)
    expect(result.inProduction).toBe(12)
    expect(result.dispatchedThisWeek).toBe(4)
    expect(result.timezone).toBe('Asia/Kolkata')
    expect(result.weekStartsAt).toBe('2026-01-04T18:30:00.000Z')

    const [sql, params] = (em as unknown as { __execute: jest.Mock }).__execute.mock.calls[0]
    // A true aggregate query never paginates — asserting no LIMIT/OFFSET
    // guards against a future regression that accidentally re-introduces
    // page-scoped counting here.
    expect(sql).not.toMatch(/LIMIT/i)
    expect(sql).not.toMatch(/OFFSET/i)
    expect(sql).toMatch(/COUNT\(\*\)/i)
    expect(params).toEqual(['2026-01-04T18:30:00.000Z', TENANT_ID, PROFILE_ID])
  })

  it('fails closed (never computes for a caller-supplied dealer id) when the caller has no approved profile', async () => {
    const em = makeEm({})
    ;(em.findOne as jest.Mock).mockResolvedValueOnce(null)
    await expect(computeDealerDashboard(em as never, ORG_ID, TENANT_ID)).rejects.toThrow()
    expect((em as unknown as { __execute: jest.Mock }).__execute).not.toHaveBeenCalled()
  })
})
