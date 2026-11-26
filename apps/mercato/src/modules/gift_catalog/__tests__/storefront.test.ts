import { beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * Public gift_catalog reads (FEAT-001/002, US-001):
 *  - shop scope resolution: custom-domain host > customer session > shop
 *    identifier; the tenant is always derived server-side; inactive shops and
 *    identifier/host mismatches fail closed;
 *  - occasions: only active, live occasions of the resolved shop;
 *  - gift profiles: only profiles of live, active products of the shop;
 *    recipient filters include "anyone"; malformed id lists never widen;
 *  - the admin product enricher reads profiles in the caller's scope only.
 */

type Row = Record<string, unknown>

class MockOrganization {}
class MockGiftOccasion {}
class MockGiftProductProfile {}
class MockCatalogProduct {}

const getCustomerAuthFromRequest = jest.fn<(req: Request) => Promise<unknown>>()
const resolveByHostname = jest.fn<(host: string) => Promise<unknown>>()

const db = {
  organizations: [] as Row[],
  occasions: [] as Row[],
  profiles: [] as Row[],
  products: [] as Row[],
}
const calls: Array<{ entity: unknown; where: Row; options?: Row }> = []

function storeOf(entity: unknown): Row[] {
  if (entity === MockOrganization) return db.organizations
  if (entity === MockGiftOccasion) return db.occasions
  if (entity === MockGiftProductProfile) return db.profiles
  if (entity === MockCatalogProduct) return db.products
  return []
}

function rowMatches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key]
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const op = expected as Row
      if (Array.isArray(op.$in)) return (op.$in as unknown[]).includes(actual)
      if (Array.isArray(op.$overlap)) return Array.isArray(actual) && (op.$overlap as unknown[]).some((value) => (actual as unknown[]).includes(value))
      return true
    }
    // ORM references (e.g. `organization.tenant`) compare by id.
    if (actual && typeof actual === 'object' && 'id' in (actual as Row)) return (actual as Row).id === expected
    return (actual ?? null) === expected
  })
}

function find(entity: unknown, where: Row, options?: Row): Row[] {
  calls.push({ entity, where, options })
  const rows = storeOf(entity).filter((row) => rowMatches(row, where))
  return typeof options?.limit === 'number' ? rows.slice(0, options.limit) : rows
}

const em = {
  fork: () => em,
  find: jest.fn(async (entity: unknown, where: Row, options?: Row) => find(entity, where, options)),
  findOne: jest.fn(async (entity: unknown, where: Row, options?: Row) => find(entity, where, options)[0] ?? null),
}
const container = {
  resolve: (name: string) => {
    if (name === 'em') return em
    if (name === 'domainMappingService') return { resolveByHostname }
    throw new Error(`unexpected ${name}`)
  },
}

jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: async () => container }))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))
jest.mock('@open-mercato/core/modules/directory/data/entities', () => ({ Organization: MockOrganization }))
jest.mock('@open-mercato/core/modules/catalog/data/entities', () => ({ CatalogProduct: MockCatalogProduct }))
jest.mock('../data/entities', () => ({ GiftOccasion: MockGiftOccasion, GiftProductProfile: MockGiftProductProfile }))
jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({
  getCustomerAuthFromRequest: (req: Request) => getCustomerAuthFromRequest(req),
}))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: async (_em: unknown, entity: unknown, where: Row, options?: Row) => find(entity, where, options),
}))

import { resolveStorefrontScope } from '../lib/storefrontScope'
import { listActiveOccasions, listStorefrontProfiles, STOREFRONT_PROFILE_SCAN_LIMIT } from '../lib/storefrontQueries'
import { enrichers } from '../data/enrichers'
import { GET as occasionsRoute } from '../api/storefront/occasions/route'
import { GET as profilesRoute } from '../api/storefront/profiles/route'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT = '33333333-3333-4333-8333-333333333333'
const OTHER_ORG = '44444444-4444-4444-8444-444444444444'
const SCOPE = { tenantId: TENANT, organizationId: ORG }
const P1 = 'a1111111-1111-4111-8111-111111111111'
const P2 = 'a2222222-2222-4222-8222-222222222222'
const P3 = 'a3333333-3333-4333-8333-333333333333'

function request(path = '/api/gift_catalog/storefront/occasions', host = 'shop.giftory.test') {
  return new Request(`http://${host}${path}`, { headers: { host } })
}

function org(overrides: Row = {}): Row {
  return { id: ORG, tenant: { id: TENANT }, slug: 'giftory', isActive: true, deletedAt: null, createdAt: new Date('2026-01-01'), ...overrides }
}

function profile(productId: string, overrides: Row = {}): Row {
  return {
    id: `profile-${productId}`,
    productId,
    tenantId: TENANT,
    organizationId: ORG,
    deletedAt: null,
    occasions: ['birthday'],
    recipientTypes: ['her'],
    isCustomizable: false,
    proofRequired: false,
    giftWrapAvailable: true,
    giftMessageMaxLength: 120,
    productionLeadTimeDays: null,
    personalizationNotes: null,
    fulfillmentMode: 'dealer',
    updatedAt: new Date('2026-10-01'),
    ...overrides,
  }
}

function liveProduct(id: string, overrides: Row = {}): Row {
  return { id, tenantId: TENANT, organizationId: ORG, deletedAt: null, isActive: true, ...overrides }
}

beforeEach(() => {
  db.organizations = [org()]
  db.occasions = []
  db.profiles = []
  db.products = []
  calls.length = 0
  em.find.mockClear()
  em.findOne.mockClear()
  getCustomerAuthFromRequest.mockReset()
  getCustomerAuthFromRequest.mockResolvedValue(null)
  resolveByHostname.mockReset()
  resolveByHostname.mockResolvedValue(null)
})

describe('resolveStorefrontScope', () => {
  it('requires a shop identifier on platform domains for anonymous shoppers', async () => {
    expect(await resolveStorefrontScope(request(), container as never, {})).toEqual({ ok: false, status: 400, reason: 'shop_required' })
  })

  it('derives the tenant from the organization row, never from the caller', async () => {
    const result = await resolveStorefrontScope(request(), container as never, { organizationId: ORG })
    expect(result).toEqual({ ok: true, scope: SCOPE, source: 'shop' })
    expect(await resolveStorefrontScope(request(), container as never, { orgSlug: 'giftory' })).toMatchObject({ ok: true, scope: SCOPE })
  })

  it('never resolves inactive, deleted or unknown shops', async () => {
    db.organizations = [org({ isActive: false })]
    expect(await resolveStorefrontScope(request(), container as never, { organizationId: ORG })).toMatchObject({ ok: false, status: 404, reason: 'shop_not_found' })
    db.organizations = [org({ deletedAt: new Date() })]
    expect(await resolveStorefrontScope(request(), container as never, { orgSlug: 'giftory' })).toMatchObject({ ok: false, status: 404 })
    db.organizations = []
    expect(await resolveStorefrontScope(request(), container as never, { organizationId: OTHER_ORG })).toMatchObject({ ok: false, status: 404 })
  })

  it('an active custom-domain mapping wins and must agree with any identifier sent', async () => {
    resolveByHostname.mockResolvedValue({ tenantId: TENANT, organizationId: ORG, status: 'active' })
    expect(await resolveStorefrontScope(request(), container as never, {})).toEqual({ ok: true, scope: SCOPE, source: 'host' })
    db.organizations.push(org({ id: OTHER_ORG, tenant: { id: OTHER_TENANT }, slug: 'other' }))
    expect(await resolveStorefrontScope(request(), container as never, { organizationId: OTHER_ORG })).toEqual({ ok: false, status: 404, reason: 'shop_mismatch' })
    expect(await resolveStorefrontScope(request(), container as never, { orgSlug: 'other' })).toMatchObject({ ok: false, reason: 'shop_mismatch' })
    expect(await resolveStorefrontScope(request(), container as never, { orgSlug: 'giftory' })).toMatchObject({ ok: true, source: 'host' })
  })

  it('ignores inactive domain mappings and resolver failures', async () => {
    resolveByHostname.mockResolvedValueOnce({ tenantId: OTHER_TENANT, organizationId: OTHER_ORG, status: 'pending' })
    expect(await resolveStorefrontScope(request(), container as never, { organizationId: ORG })).toMatchObject({ ok: true, scope: SCOPE, source: 'shop' })
    resolveByHostname.mockRejectedValueOnce(new Error('no custom domains'))
    expect(await resolveStorefrontScope(request(), container as never, { organizationId: ORG })).toMatchObject({ ok: true, source: 'shop' })
  })

  it("uses the signed-in customer's shop and rejects an identifier for a different shop", async () => {
    getCustomerAuthFromRequest.mockResolvedValue({ sub: 'u1', tenantId: TENANT, orgId: ORG })
    expect(await resolveStorefrontScope(request(), container as never, {})).toEqual({ ok: true, scope: SCOPE, source: 'customer' })
    db.organizations.push(org({ id: OTHER_ORG, tenant: { id: OTHER_TENANT }, slug: 'other' }))
    expect(await resolveStorefrontScope(request(), container as never, { organizationId: OTHER_ORG })).toMatchObject({ ok: false, reason: 'shop_mismatch' })
  })
})

describe('listActiveOccasions', () => {
  it('returns only active, live occasions of the shop in sort order', async () => {
    db.occasions = [
      { code: 'birthday', label: 'Birthday', sortOrder: 10, isActive: true, deletedAt: null, tenantId: TENANT, organizationId: ORG },
      { code: 'wedding', label: 'Wedding', sortOrder: 30, isActive: false, deletedAt: null, tenantId: TENANT, organizationId: ORG },
      { code: 'festival', label: 'Festivals', sortOrder: 70, isActive: true, deletedAt: new Date(), tenantId: TENANT, organizationId: ORG },
      { code: 'corporate', label: 'Corporate', sortOrder: 80, isActive: true, deletedAt: null, tenantId: TENANT, organizationId: OTHER_ORG },
    ]
    const items = await listActiveOccasions(em as never, SCOPE)
    expect(items).toEqual([{ code: 'birthday', label: 'Birthday', description: null, imageUrl: null, sortOrder: 10 }])
    expect(calls[0]!.options).toMatchObject({ orderBy: { sortOrder: 'asc', label: 'asc' } })
  })
})

describe('listStorefrontProfiles', () => {
  beforeEach(() => {
    db.profiles = [
      profile(P1, { occasions: ['birthday'], recipientTypes: ['her'] }),
      profile(P2, { occasions: ['birthday', 'wedding'], recipientTypes: ['anyone'], isCustomizable: true }),
      profile(P3, { occasions: ['birthday'], recipientTypes: ['him'] }),
    ]
    db.products = [liveProduct(P1), liveProduct(P2), liveProduct(P3)]
  })

  it('filters by occasion and keeps products targeted at "anyone" for any recipient', async () => {
    const page = await listStorefrontProfiles(em as never, SCOPE, { occasion: 'birthday', recipient: 'her', page: 1, pageSize: 50 })
    expect(page.items.map((item) => item.productId).sort()).toEqual([P1, P2].sort())
  })

  it('hides profiles whose product is inactive, deleted or in another organization', async () => {
    db.products = [liveProduct(P1, { isActive: false }), liveProduct(P2, { deletedAt: new Date() }), liveProduct(P3, { organizationId: OTHER_ORG })]
    const page = await listStorefrontProfiles(em as never, SCOPE, { page: 1, pageSize: 50 })
    expect(page).toMatchObject({ items: [], total: 0 })
  })

  it('never returns profiles of another organization', async () => {
    db.profiles.push(profile('a4444444-4444-4444-8444-444444444444', { organizationId: OTHER_ORG }))
    const page = await listStorefrontProfiles(em as never, SCOPE, { page: 1, pageSize: 50 })
    expect(page.total).toBe(3)
    expect(calls[0]!.where).toMatchObject({ tenantId: TENANT, organizationId: ORG, deletedAt: null })
  })

  it('an explicitly empty product id list returns nothing without querying', async () => {
    expect(await listStorefrontProfiles(em as never, SCOPE, { productIds: [], page: 1, pageSize: 50 })).toMatchObject({ items: [], total: 0 })
    expect(calls).toHaveLength(0)
  })

  it('paginates and reports the scan cap', async () => {
    const page = await listStorefrontProfiles(em as never, SCOPE, { customizable: false, page: 2, pageSize: 1 })
    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 1, totalPages: 2, totalIsCapped: false })
    expect(page.items).toHaveLength(1)
    expect(calls[0]!.options).toMatchObject({ limit: STOREFRONT_PROFILE_SCAN_LIMIT + 1 })
  })

  it('exposes the public profile shape only', async () => {
    const page = await listStorefrontProfiles(em as never, SCOPE, { productIds: [P1], page: 1, pageSize: 50 })
    expect(Object.keys(page.items[0]!).sort()).toEqual(
      [
        'fulfillmentMode',
        'giftMessageMaxLength',
        'giftWrapAvailable',
        'isCustomizable',
        'occasions',
        'personalizationNotes',
        'productId',
        'productionLeadTimeDays',
        'proofRequired',
        'recipientTypes',
      ].sort(),
    )
  })
})

describe('public storefront routes', () => {
  it('occasions: 400 for an invalid query, 400 without a shop, 200 with the shop', async () => {
    expect((await occasionsRoute(request('/api/gift_catalog/storefront/occasions?organizationId=nope'))).status).toBe(400)
    expect((await occasionsRoute(request('/api/gift_catalog/storefront/occasions'))).status).toBe(400)
    db.occasions = [{ code: 'birthday', label: 'Birthday', sortOrder: 10, isActive: true, deletedAt: null, tenantId: TENANT, organizationId: ORG }]
    const response = await occasionsRoute(request(`/api/gift_catalog/storefront/occasions?organizationId=${ORG}&tenantId=${OTHER_TENANT}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, items: [{ code: 'birthday' }] })
  })

  it('occasions: 500 without internals when the database fails', async () => {
    em.find.mockRejectedValueOnce(new Error(`relation gift_occasions missing for ${TENANT}`))
    const response = await occasionsRoute(request(`/api/gift_catalog/storefront/occasions?organizationId=${ORG}`))
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).not.toContain('gift_occasions')
    expect(text).not.toContain(TENANT)
  })

  it('profiles: a malformed productIds list matches nothing instead of everything', async () => {
    db.profiles = [profile(P1)]
    db.products = [liveProduct(P1)]
    const response = await profilesRoute(request(`/api/gift_catalog/storefront/profiles?organizationId=${ORG}&productIds=not-a-uuid`))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, items: [], total: 0 })
  })

  it('profiles: rejects unknown occasion codes and returns 404 for unknown shops', async () => {
    expect((await profilesRoute(request(`/api/gift_catalog/storefront/profiles?organizationId=${ORG}&occasion=halloween`))).status).toBe(400)
    expect((await profilesRoute(request(`/api/gift_catalog/storefront/profiles?organizationId=${OTHER_ORG}`))).status).toBe(404)
  })
})

describe('product gift-profile enricher', () => {
  const enricher = enrichers[0]!

  it('requires gift_catalog.view and degrades to a null fallback', () => {
    expect(enricher.features).toEqual(['gift_catalog.view'])
    expect(enricher.critical).toBe(false)
    expect(enricher.fallback).toEqual({ _giftCatalog: null })
  })

  it('batches one scoped query and adds a compact summary per product', async () => {
    db.profiles = [profile(P1, { giftWrapAvailable: true, fulfillmentMode: 'platform' }), profile(P2, { organizationId: OTHER_ORG })]
    const enriched = (await enricher.enrichMany!([{ id: P1 }, { id: P2 }, { id: 42 }], { em, tenantId: TENANT, organizationId: ORG } as never)) as Row[]
    expect(em.find).toHaveBeenCalledTimes(1)
    expect(calls[0]!.where).toMatchObject({ tenantId: TENANT, organizationId: ORG, deletedAt: null })
    expect(enriched[0]!._giftCatalog).toMatchObject({ profileId: `profile-${P1}`, giftWrapAvailable: true, fulfillmentMode: 'platform' })
    expect(enriched[1]!._giftCatalog).toBeNull()
    expect(enriched[2]!._giftCatalog).toBeNull()
  })

  it('skips the query entirely when no record has an id', async () => {
    const enriched = (await enricher.enrichMany!([{ name: 'x' }], { em, tenantId: TENANT, organizationId: ORG } as never)) as Row[]
    expect(em.find).not.toHaveBeenCalled()
    expect(enriched[0]!._giftCatalog).toBeNull()
  })
})
