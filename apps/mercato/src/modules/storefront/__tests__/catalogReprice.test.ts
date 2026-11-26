import { beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * Server-side re-pricing (FEAT-003 req. 7, FEAT-004): every cart/order line is
 * priced from the catalog of the resolved shop, never from the client, and
 * rejected with a stable issue code when it cannot be bought as requested.
 */

type Row = Record<string, unknown>

class MockProduct {}
class MockVariant {}
class MockPrice {}
class MockCategory {}
class MockCategoryAssignment {}
class MockAttachment {}

const db = {
  products: [] as Row[],
  variants: [] as Row[],
  prices: [] as Row[],
  profiles: [] as Row[],
}
const calls: Array<{ entity: unknown; where: Row; options?: Row }> = []
const listStorefrontProfiles = jest.fn(async (_em: unknown, _scope: unknown, filter: { productIds?: string[]; occasion?: string }) => {
  const items = db.profiles.filter((profile) => !filter.productIds || filter.productIds.includes(profile.productId as string))
  return { items, total: items.length, page: 1, pageSize: items.length, totalPages: 1, totalIsCapped: false }
})

function rowsFor(entity: unknown): Row[] {
  if (entity === MockProduct) return db.products
  if (entity === MockVariant) return db.variants
  if (entity === MockPrice) return db.prices
  return []
}

function idIn(where: Row): string[] | null {
  const id = where.id as { $in?: string[] } | undefined
  return id && Array.isArray(id.$in) ? id.$in : null
}

/** Applies the scope + liveness filters the production code must send. */
function applyWhere(entity: unknown, where: Row): Row[] {
  calls.push({ entity, where })
  return rowsFor(entity).filter((row) => {
    if (where.tenantId !== undefined && row.tenantId !== where.tenantId) return false
    if (where.organizationId !== undefined && row.organizationId !== where.organizationId) return false
    if (where.isActive === true && row.isActive === false) return false
    if (where.deletedAt === null && row.deletedAt) return false
    const ids = idIn(where)
    if (ids && !ids.includes(row.id as string)) return false
    const product = where.product as { $in?: string[] } | undefined
    if (product?.$in && entity === MockVariant && !product.$in.includes(row.product as string)) return false
    if (entity === MockPrice && where.currencyCode && row.currencyCode !== where.currencyCode) return false
    return true
  })
}

jest.mock('@open-mercato/core/modules/catalog/data/entities', () => ({
  CatalogProduct: MockProduct,
  CatalogProductVariant: MockVariant,
  CatalogProductPrice: MockPrice,
  CatalogProductCategory: MockCategory,
  CatalogProductCategoryAssignment: MockCategoryAssignment,
}))
jest.mock('@open-mercato/core/modules/attachments/data/entities', () => ({ Attachment: MockAttachment }))
jest.mock('@open-mercato/core/modules/attachments/lib/imageUrls', () => ({
  buildAttachmentImageUrl: (id: string) => `/img/${id}`,
  slugifyAttachmentFileName: (name: string) => name,
}))
jest.mock('../../gift_catalog/lib/storefrontQueries', () => ({
  listStorefrontProfiles: (...args: [unknown, unknown, { productIds?: string[] }]) => listStorefrontProfiles(...args),
}))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: async (_em: unknown, entity: unknown, where: Row, options?: Row) => {
    const rows = applyWhere(entity, where)
    calls[calls.length - 1]!.options = options
    const limit = typeof options?.limit === 'number' ? options.limit : undefined
    return limit !== undefined ? rows.slice(0, limit) : rows
  },
}))

import { listCatalogProducts, repriceLines } from '../lib/catalog'
import { catalogProductsQuerySchema } from '../data/validators'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_ORG = '44444444-4444-4444-8444-444444444444'
const SCOPE = { tenantId: TENANT, organizationId: ORG }
const PRODUCT = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
const PRODUCT_B = '7f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
const VARIANT_A = 'a1111111-1111-4111-8111-111111111111'
const VARIANT_B = 'b2222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-10-05T10:00:00Z')

const em = {
  find: jest.fn(async (entity: unknown, where: Row) => applyWhere(entity, where)),
  count: jest.fn(async (entity: unknown, where: Row) => applyWhere(entity, where).length),
}

function product(overrides: Row = {}): Row {
  return {
    id: PRODUCT,
    tenantId: TENANT,
    organizationId: ORG,
    title: 'Photo Mug',
    handle: 'photo-mug',
    sku: 'MUG-1',
    isActive: true,
    deletedAt: null,
    isQuoteOnly: false,
    minOrderQty: null,
    maxOrderQty: null,
    orderQtyIncrement: null,
    taxRate: '18',
    defaultMediaUrl: '/mug.png',
    createdAt: NOW,
    ...overrides,
  }
}

function variant(overrides: Row = {}): Row {
  return { id: VARIANT_A, product: PRODUCT, tenantId: TENANT, organizationId: ORG, name: 'Blue', sku: 'MUG-BLUE', isDefault: false, isActive: true, deletedAt: null, taxRate: null, ...overrides }
}

function price(overrides: Row = {}): Row {
  return {
    id: `price-${Math.random().toString(36).slice(2)}`,
    tenantId: TENANT,
    organizationId: ORG,
    product: PRODUCT,
    variant: null,
    offer: null,
    currencyCode: 'INR',
    priceKind: { code: 'regular' },
    kind: 'regular',
    minQuantity: 1,
    maxQuantity: null,
    unitPriceNet: null,
    unitPriceGross: '999.0000',
    taxRate: '18',
    channelId: null,
    customerId: null,
    customerGroupId: null,
    userId: null,
    userGroupId: null,
    startsAt: null,
    endsAt: null,
    ...overrides,
  }
}

function line(overrides: Row = {}) {
  return { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: null, ...overrides } as never
}

beforeEach(() => {
  db.products = [product()]
  db.variants = []
  db.prices = [price()]
  db.profiles = [{ productId: PRODUCT, giftWrapAvailable: true, giftMessageMaxLength: 20, isCustomizable: true }]
  calls.length = 0
  listStorefrontProfiles.mockClear()
  em.find.mockClear()
})

describe('repriceLines — prices come from the catalog only', () => {
  it('prices a line from the INR regular list price and computes totals in paise', async () => {
    const { lines, issues } = await repriceLines(em as never, SCOPE, [line({ quantity: 2 })], NOW)
    expect(issues).toEqual([])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ productId: PRODUCT, quantity: 2, title: 'Photo Mug', isCustomizable: true })
    expect(lines[0]!.amounts).toMatchObject({ unitGross: 999, totalGross: 1998, taxRate: 18 })
    expect(lines[0]!.amounts.taxAmount).toBeCloseTo(304.78, 2)
  })

  it('ignores any price the client sends', async () => {
    const { lines } = await repriceLines(em as never, SCOPE, [line({ unitPriceGross: 1, price: 1, totalGross: 1 })], NOW)
    expect(lines[0]!.amounts.unitGross).toBe(999)
  })

  it('reads products, variants and prices only inside the resolved tenant + organization', async () => {
    await repriceLines(em as never, SCOPE, [line()], NOW)
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const call of calls) {
      expect(call.where).toMatchObject({ tenantId: TENANT, organizationId: ORG })
    }
    const productQuery = calls.find((call) => call.entity === MockProduct)!
    expect(productQuery.where).toMatchObject({ deletedAt: null, isActive: true })
    const priceQuery = calls.find((call) => call.entity === MockPrice)!
    expect(priceQuery.where).toMatchObject({ currencyCode: 'INR' })
  })

  it("treats another organization's product as unavailable", async () => {
    db.products = [product({ organizationId: OTHER_ORG })]
    const { lines, issues } = await repriceLines(em as never, SCOPE, [line()], NOW)
    expect(lines).toEqual([])
    expect(issues).toEqual([{ index: 0, productId: PRODUCT, variantId: null, code: 'product_unavailable' }])
  })

  it('rejects inactive and deleted products', async () => {
    db.products = [product({ isActive: false })]
    expect((await repriceLines(em as never, SCOPE, [line()], NOW)).issues[0]!.code).toBe('product_unavailable')
    db.products = [product({ deletedAt: new Date() })]
    expect((await repriceLines(em as never, SCOPE, [line()], NOW)).issues[0]!.code).toBe('product_unavailable')
  })

  it('rejects quote-only products', async () => {
    db.products = [product({ isQuoteOnly: true })]
    expect((await repriceLines(em as never, SCOPE, [line()], NOW)).issues[0]!.code).toBe('quote_only')
  })

  it('reports price_unavailable when only non-INR, targeted or expired prices exist', async () => {
    db.prices = [
      price({ currencyCode: 'USD' }),
      price({ customerId: 'c1' }),
      price({ endsAt: new Date('2026-01-01') }),
      price({ priceKind: { code: 'wholesale' } }),
    ]
    expect((await repriceLines(em as never, SCOPE, [line()], NOW)).issues[0]!.code).toBe('price_unavailable')
  })
})

describe('repriceLines — variants', () => {
  beforeEach(() => {
    db.variants = [variant({ id: VARIANT_A, isDefault: true }), variant({ id: VARIANT_B, name: 'Red', sku: 'MUG-RED' })]
    db.prices = [price({ id: 'product-level' }), price({ id: 'red', variant: VARIANT_B, product: null, unitPriceGross: '1299.0000' })]
  })

  it('uses the variant price over the product price', async () => {
    const { lines } = await repriceLines(em as never, SCOPE, [line({ variantId: VARIANT_B })], NOW)
    expect(lines[0]).toMatchObject({ variantId: VARIANT_B, variantName: 'Red', sku: 'MUG-RED' })
    expect(lines[0]!.amounts).toMatchObject({ priceId: 'red', unitGross: 1299 })
  })

  it('falls back to the default variant when none is requested', async () => {
    const { lines } = await repriceLines(em as never, SCOPE, [line()], NOW)
    expect(lines[0]).toMatchObject({ variantId: VARIANT_A })
    expect(lines[0]!.amounts.priceId).toBe('product-level')
  })

  it('requires a variant choice when there are several and no default', async () => {
    db.variants = [variant({ id: VARIANT_A }), variant({ id: VARIANT_B })]
    expect((await repriceLines(em as never, SCOPE, [line()], NOW)).issues[0]!.code).toBe('variant_required')
  })

  it('auto-selects the only variant', async () => {
    db.variants = [variant({ id: VARIANT_B })]
    const { lines } = await repriceLines(em as never, SCOPE, [line()], NOW)
    expect(lines[0]!.variantId).toBe(VARIANT_B)
  })

  it('rejects a variant of another product or an inactive variant', async () => {
    db.variants = [variant({ id: VARIANT_A, isDefault: true }), variant({ id: VARIANT_B, product: PRODUCT_B })]
    expect((await repriceLines(em as never, SCOPE, [line({ variantId: VARIANT_B })], NOW)).issues[0]!.code).toBe('variant_unavailable')
    db.variants = [variant({ id: VARIANT_B, isActive: false })]
    expect((await repriceLines(em as never, SCOPE, [line({ variantId: VARIANT_B })], NOW)).issues[0]!.code).toBe('variant_unavailable')
  })
})

describe('repriceLines — quantity and gift rules', () => {
  it('enforces product order quantity rules', async () => {
    db.products = [product({ minOrderQty: 2, maxOrderQty: 6, orderQtyIncrement: 2 })]
    const result = await repriceLines(em as never, SCOPE, [line({ quantity: 1 }), line({ quantity: 3 }), line({ quantity: 8 }), line({ quantity: 4 })], NOW)
    expect(result.issues.map((issue) => issue.code)).toEqual(['quantity_below_minimum', 'quantity_increment', 'quantity_above_maximum'])
    expect(result.lines.map((priced) => priced.index)).toEqual([3])
    expect(result.lines[0]!.maxQuantity).toBe(6)
  })

  it('enforces the gift profile message limit and reports it', async () => {
    const { issues } = await repriceLines(em as never, SCOPE, [line({ giftMessage: 'x'.repeat(21) })], NOW)
    expect(issues[0]).toMatchObject({ code: 'gift_message_too_long', maxLength: 20 })
  })

  it('rejects gift wrap on products whose profile does not offer it', async () => {
    db.profiles = [{ productId: PRODUCT, giftWrapAvailable: false, giftMessageMaxLength: 250, isCustomizable: false }]
    expect((await repriceLines(em as never, SCOPE, [line({ giftWrap: true })], NOW)).issues[0]!.code).toBe('gift_wrap_unavailable')
  })

  it('applies gift_catalog defaults (no wrap, 250 chars) to products without a profile', async () => {
    db.profiles = []
    const result = await repriceLines(
      em as never,
      SCOPE,
      [line({ giftWrap: true }), line({ giftMessage: 'x'.repeat(250) }), line({ giftMessage: 'x'.repeat(251) })],
      NOW,
    )
    expect(result.issues.map((issue) => [issue.index, issue.code])).toEqual([
      [0, 'gift_wrap_unavailable'],
      [2, 'gift_message_too_long'],
    ])
    expect(result.lines.map((priced) => priced.index)).toEqual([1])
  })

  it('looks up gift profiles only for live products of this shop', async () => {
    db.products = [product(), product({ id: PRODUCT_B, isActive: false })]
    await repriceLines(em as never, SCOPE, [line(), line({ productId: PRODUCT_B })], NOW)
    expect(listStorefrontProfiles).toHaveBeenCalledWith(em, SCOPE, expect.objectContaining({ productIds: [PRODUCT] }))
  })

  it('normalizes gift messages before storing them on the priced line', async () => {
    const { lines } = await repriceLines(em as never, SCOPE, [line({ giftMessage: '  Love you\r\nMum  ', giftWrap: true })], NOW)
    expect(lines[0]).toMatchObject({ giftWrap: true, giftMessage: 'Love you\nMum' })
  })
})

describe('listCatalogProducts — filters never widen the result', () => {
  const query = (input: Row) => catalogProductsQuerySchema.parse(input)

  it('returns nothing (without querying products) for a malformed ids filter', async () => {
    const result = await listCatalogProducts(em as never, SCOPE, query({ ids: 'not-a-uuid,also-bad' }), NOW)
    expect(result).toMatchObject({ items: [], total: 0 })
    expect(calls.find((call) => call.entity === MockProduct)).toBeUndefined()
  })

  it('giftOnly=true restricts the listing to products that have a gift profile', async () => {
    db.products = [product(), product({ id: PRODUCT_B, title: 'Plain pen', handle: 'pen' })]
    db.prices = [price(), price({ product: PRODUCT_B })]
    db.profiles = [{ productId: PRODUCT }]
    const result = await listCatalogProducts(em as never, SCOPE, query({ giftOnly: 'true' }), NOW)
    expect(result.items.map((item) => item.id)).toEqual([PRODUCT])
  })

  it('an occasion with no matching profiles yields an empty page', async () => {
    db.profiles = []
    const result = await listCatalogProducts(em as never, SCOPE, query({ occasion: 'birthday' }), NOW)
    expect(result.items).toEqual([])
    expect(listStorefrontProfiles).toHaveBeenCalledWith(em, SCOPE, expect.objectContaining({ occasion: 'birthday' }))
  })

  it('filters and sorts by the server-computed price (INR major units)', async () => {
    db.products = [product(), product({ id: PRODUCT_B, title: 'Frame', handle: 'frame' })]
    db.prices = [price({ unitPriceGross: '999.0000' }), price({ product: PRODUCT_B, unitPriceGross: '499.0000' })]
    const sorted = await listCatalogProducts(em as never, SCOPE, query({ sort: 'price-asc' }), NOW)
    expect(sorted.items.map((item) => item.pricing?.unit_price_gross)).toEqual([499, 999])
    const ranged = await listCatalogProducts(em as never, SCOPE, query({ minPrice: '500' }), NOW)
    expect(ranged.items.map((item) => item.id)).toEqual([PRODUCT])
    expect(ranged.items[0]!.pricing).toMatchObject({ currency_code: 'INR', unit_price_gross: 999 })
  })

  it('escapes LIKE wildcards in the search term', async () => {
    await listCatalogProducts(em as never, SCOPE, query({ search: '100%_off' }), NOW)
    const productQuery = calls.find((call) => call.entity === MockProduct)!
    expect(JSON.stringify(productQuery.where)).toContain('%100\\\\%\\\\_off%')
  })
})
