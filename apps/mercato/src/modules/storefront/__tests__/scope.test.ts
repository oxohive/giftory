import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const resolveStorefrontScope = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const getCustomerAuthFromRequest = jest.fn<(...args: unknown[]) => Promise<unknown>>()

jest.mock('../../gift_catalog/lib/storefrontScope', () => ({
  resolveStorefrontScope: (...args: unknown[]) => resolveStorefrontScope(...args),
}))
jest.mock('@open-mercato/core/modules/customer_accounts/lib/customerAuth', () => ({
  getCustomerAuthFromRequest: (...args: unknown[]) => getCustomerAuthFromRequest(...args),
}))

import { readShopIdentifier, resolveShopper } from '../lib/scope'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_ORG = '33333333-3333-4333-8333-333333333333'
const container = {} as never

function request(url: string) {
  return new Request(url, { headers: { host: 'localhost:3000' } })
}

describe('storefront scope resolution', () => {
  beforeEach(() => {
    resolveStorefrontScope.mockReset()
    getCustomerAuthFromRequest.mockReset()
  })

  it('reads the shop identifier from the query only', () => {
    expect(readShopIdentifier(new URL(`http://x/api?organizationId=${ORG}`))).toEqual({ organizationId: ORG })
    expect(readShopIdentifier(new URL('http://x/api?orgSlug=giftory'))).toEqual({ orgSlug: 'giftory' })
    expect(readShopIdentifier(new URL('http://x/api'))).toEqual({})
  })

  it('turns a malformed identifier into one that can never resolve (fail closed)', () => {
    const identifier = readShopIdentifier(new URL('http://x/api?organizationId=not-a-uuid'))
    expect(identifier.organizationId).toBeUndefined()
    expect(identifier.orgSlug).toBeDefined()
  })

  it('maps scope failures to 400/404 without a scope', async () => {
    resolveStorefrontScope.mockResolvedValueOnce({ ok: false, status: 400, reason: 'shop_required' })
    await expect(resolveShopper(request('http://localhost:3000/api/storefront/cart'), container)).resolves.toEqual({
      ok: false,
      status: 400,
      code: 'shop_required',
    })
    resolveStorefrontScope.mockResolvedValueOnce({ ok: false, status: 404, reason: 'shop_mismatch' })
    await expect(resolveShopper(request('http://localhost:3000/api/storefront/cart'), container)).resolves.toMatchObject({
      ok: false,
      status: 404,
      code: 'shop_not_found',
    })
  })

  it('derives the scope server-side and attaches a customer of the same shop', async () => {
    resolveStorefrontScope.mockResolvedValueOnce({ ok: true, scope: { tenantId: TENANT, organizationId: ORG }, source: 'shop' })
    getCustomerAuthFromRequest.mockResolvedValueOnce({ sub: 'user-1', tenantId: TENANT, orgId: ORG })
    const result = await resolveShopper(request(`http://localhost:3000/api/storefront/cart?organizationId=${ORG}&tenantId=evil`), container)
    expect(result).toMatchObject({ ok: true, shopper: { scope: { tenantId: TENANT, organizationId: ORG }, customer: { sub: 'user-1' } } })
    expect(resolveStorefrontScope).toHaveBeenCalledWith(expect.any(Request), container, { organizationId: ORG })
  })

  it('drops a customer session that belongs to another shop', async () => {
    resolveStorefrontScope.mockResolvedValueOnce({ ok: true, scope: { tenantId: TENANT, organizationId: ORG }, source: 'host' })
    getCustomerAuthFromRequest.mockResolvedValueOnce({ sub: 'user-2', tenantId: TENANT, orgId: OTHER_ORG })
    const result = await resolveShopper(request('http://localhost:3000/api/storefront/orders'), container)
    expect(result).toMatchObject({ ok: true, shopper: { customer: null } })
  })

  it('treats a failing session lookup as a guest', async () => {
    resolveStorefrontScope.mockResolvedValueOnce({ ok: true, scope: { tenantId: TENANT, organizationId: ORG }, source: 'shop' })
    getCustomerAuthFromRequest.mockRejectedValueOnce(new Error('db down'))
    const result = await resolveShopper(request(`http://localhost:3000/api/storefront/cart?organizationId=${ORG}`), container)
    expect(result).toMatchObject({ ok: true, shopper: { customer: null } })
  })
})
