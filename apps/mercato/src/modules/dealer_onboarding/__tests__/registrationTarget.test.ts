import { describe, expect, it, jest } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DealerProfile } from '../data/entities'
import {
  evaluateRegistrationOrganization,
  resolveRegistrationTarget,
  type RegistrationOrganizationRow,
} from '../lib/registrationTarget'

/**
 * Known gap 7 — `POST /dealer/onboarding/register` takes a client-chosen
 * `organizationId` (from the invite link) on an unauthenticated route and
 * uses it to resolve the tenant. Hardening: only an active, root, non-dealer
 * organization is an acceptable invite target, and every rejection looks
 * identical to "not found" from the outside.
 */

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ROOT_ORG = '5e4fe2d8-71a6-4c15-978a-e31df68d84c7' // the documented invite-link org shape
const DEALER_ORG = 'bbbbbbbb-0000-4000-a000-00000000000d'
const CHILD_ORG = 'bbbbbbbb-0000-4000-a000-00000000000c'

function org(overrides: Partial<RegistrationOrganizationRow> = {}): RegistrationOrganizationRow {
  return {
    id: ROOT_ORG,
    tenant: { id: TENANT_ID },
    isActive: true,
    parentId: null,
    deletedAt: null,
    ...overrides,
  }
}

describe('evaluateRegistrationOrganization', () => {
  it('accepts an active root marketplace organization and resolves its tenant', () => {
    expect(evaluateRegistrationOrganization(org(), false)).toEqual({
      ok: true,
      target: { tenantId: TENANT_ID, marketplaceOrganizationId: ROOT_ORG },
    })
  })

  it('accepts the tenant as a plain id string as well as a populated reference', () => {
    const result = evaluateRegistrationOrganization(org({ tenant: TENANT_ID }), false)
    expect(result).toEqual({ ok: true, target: { tenantId: TENANT_ID, marketplaceOrganizationId: ROOT_ORG } })
  })

  it('treats a missing isActive flag (legacy row) as active', () => {
    expect(evaluateRegistrationOrganization(org({ isActive: undefined }), false).ok).toBe(true)
  })

  it.each([
    ['unknown organization', null, false, 'not_found'],
    ['soft-deleted organization', org({ deletedAt: new Date() }), false, 'not_found'],
    ['organization without a tenant', org({ tenant: null }), false, 'no_tenant'],
    ['inactive organization (e.g. a pending dealer org)', org({ isActive: false }), false, 'inactive'],
    ['child organization', org({ id: CHILD_ORG, parentId: ROOT_ORG }), false, 'not_root'],
    ['dealer organization', org({ id: DEALER_ORG }), true, 'dealer_organization'],
  ] as const)('rejects %s', (_label, row, isDealer, reason) => {
    expect(evaluateRegistrationOrganization(row, isDealer)).toEqual({ ok: false, reason })
  })
})

describe('resolveRegistrationTarget', () => {
  function makeEm(dealerProfileFor: string | null) {
    return {
      findOne: jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
        if (entity !== DealerProfile) throw new Error('unexpected entity')
        return dealerProfileFor && where.organizationId === dealerProfileFor ? { id: 'profile' } : null
      }),
    }
  }

  it('resolves the tenant for the root marketplace org (existing invite links keep working)', async () => {
    const em = makeEm(null)
    const load = jest.fn(async (_em: unknown, _organizationId: string) => org())
    const result = await resolveRegistrationTarget(em as never, ROOT_ORG, load)
    expect(load).toHaveBeenCalledWith(em, ROOT_ORG)
    expect(result).toEqual({ ok: true, target: { tenantId: TENANT_ID, marketplaceOrganizationId: ROOT_ORG } })
  })

  it("rejects a dealer's own (approved, active, root) organization id used as an invite link", async () => {
    const em = makeEm(DEALER_ORG)
    const result = await resolveRegistrationTarget(em as never, DEALER_ORG, async () => org({ id: DEALER_ORG }))
    expect(result).toEqual({ ok: false, reason: 'dealer_organization' })
  })

  it('checks for ANY dealer profile on the org (including soft-deleted) within the org tenant', async () => {
    const em = makeEm(null)
    await resolveRegistrationTarget(em as never, ROOT_ORG, async () => org())
    expect(em.findOne).toHaveBeenCalledWith(DealerProfile, { organizationId: ROOT_ORG, tenantId: TENANT_ID })
    const where = em.findOne.mock.calls[0][1] as Record<string, unknown>
    expect('deletedAt' in where).toBe(false)
  })

  it('does not query dealer profiles at all for an unknown or ineligible org', async () => {
    const em = makeEm(null)
    expect(await resolveRegistrationTarget(em as never, ROOT_ORG, async () => null)).toEqual({ ok: false, reason: 'not_found' })
    expect(await resolveRegistrationTarget(em as never, ROOT_ORG, async () => org({ isActive: false }))).toEqual({
      ok: false,
      reason: 'inactive',
    })
    expect(em.findOne).not.toHaveBeenCalled()
  })
})

describe('register route: uniform rejection response (no org-id oracle)', () => {
  const routeSource = readFileSync(
    join(__dirname, '..', 'api', 'dealer', 'onboarding', 'register', 'route.ts'),
    'utf8',
  )

  it('resolves the tenant through resolveRegistrationTarget', () => {
    expect(routeSource).toMatch(/resolveRegistrationTarget\(em, parsed\.organizationId, loadDirectoryOrganization\)/)
  })

  it('collapses every rejection reason into one 404 org_not_found response', () => {
    const orgCodes = routeSource.match(/code: '[a-z_]+'/g) ?? []
    expect(orgCodes).toEqual(["code: 'org_not_found'"])
    expect(routeSource.match(/status: 404/g)).toHaveLength(1)
    // The internal reason is never echoed to the caller.
    expect(routeSource).not.toMatch(/resolution\.reason/)
  })

  it('still rate-limits the unauthenticated endpoint to 5 requests per hour', () => {
    expect(routeSource).toMatch(/requireAuth: false/)
    expect(routeSource).toMatch(/points: 5,/)
    expect(routeSource).toMatch(/duration: 60 \* 60,/)
  })
})
