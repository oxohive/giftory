import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { randomUUID } from 'node:crypto'

/**
 * Server-side cart (FEAT-003): anonymous cookie carts, customer carts, merge
 * on login, line de-duplication, gift options and tenant isolation.
 *
 * The EntityManager is an in-memory fake whose `findOne` / `nativeUpdate` /
 * `findWithDecryption` honour the equality filters the production code passes.
 * That makes tenant isolation a functional property of the test: a cart that
 * belongs to another tenant/organization is simply not returned when the
 * production query is scoped correctly.
 */

type Row = Record<string, unknown>

const repriceLines = jest.fn<(...args: unknown[]) => Promise<{ lines: Row[]; issues: Row[] }>>()

jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('../lib/catalog', () => ({
  repriceLines: (...args: unknown[]) => repriceLines(...args),
}))

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: async (em: FakeEm, entity: unknown, where: Row, options?: { orderBy?: Row }) =>
    em.findAll(entity, where, options),
  findOneWithDecryption: async (em: FakeEm, entity: unknown, where: Row) => em.findOne(entity, where),
}))

import { StorefrontCart, StorefrontCartLine } from '../data/entities'
import {
  addCartLine,
  buildCartView,
  cartLineInputs,
  clearCart,
  markCartConverted,
  removeCartLine,
  replaceCartLines,
  resolveCart,
  updateCartLine,
} from '../lib/cart'
import { CART_COOKIE, CART_STATUS, MAX_CART_LINES, MAX_LINE_QUANTITY } from '../lib/constants'
import { cartLineKey } from '../lib/giftOptions'
import { StorefrontError } from '../lib/http'
import { hashToken } from '../lib/tokens'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT = '33333333-3333-4333-8333-333333333333'
const OTHER_ORG = '44444444-4444-4444-8444-444444444444'
const SCOPE = { tenantId: TENANT, organizationId: ORG }
const PRODUCT = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
const PRODUCT_B = '7f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
const CUSTOMER = { sub: 'aaaaaaaa-0000-4000-8000-000000000001', tenantId: TENANT, orgId: ORG } as never
const TOKEN = 'a'.repeat(43)
const translate = (_key: string, fallback: string) => fallback

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) return true // operators are not modelled
    return (row[key] ?? null) === expected
  })
}

class FakeEm {
  carts: Row[] = []
  lines: Row[] = []
  flush = jest.fn(async () => undefined)
  clear = jest.fn(() => undefined)

  store(entity: unknown): Row[] {
    if (entity === StorefrontCart) return this.carts
    if (entity === StorefrontCartLine) return this.lines
    throw new Error('unexpected entity')
  }

  findOne = jest.fn(async (entity: unknown, where: Row, options?: { orderBy?: Row }) => this.findAll(entity, where, options)[0] ?? null)

  findAll(entity: unknown, where: Row, options?: { orderBy?: Row }): Row[] {
    const rows = this.store(entity).filter((row) => matches(row, where))
    if (options?.orderBy && 'updatedAt' in options.orderBy) {
      rows.sort((a, b) => (b.updatedAt as Date).getTime() - (a.updatedAt as Date).getTime())
    }
    return rows
  }

  create = jest.fn((entity: unknown, data: Row) => {
    const row = { id: randomUUID(), deletedAt: null, ...data }
    this.store(entity).push(row)
    return row
  })

  nativeUpdate = jest.fn(async (entity: unknown, where: Row, data: Row) => {
    const rows = this.store(entity).filter((row) => matches(row, where))
    for (const row of rows) Object.assign(row, data)
    return rows.length
  })

  transactional = jest.fn(async (work: (tx: FakeEm) => Promise<unknown>) => work(this))
}

function seedCart(em: FakeEm, overrides: Row = {}): Row {
  const cart = {
    id: randomUUID(),
    tenantId: TENANT,
    organizationId: ORG,
    customerUserId: null,
    tokenHash: null,
    currencyCode: 'INR',
    status: CART_STATUS.active,
    deletedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  }
  em.carts.push(cart)
  return cart
}

function seedLine(em: FakeEm, cartId: string, overrides: Row = {}): Row {
  const base = { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: null, ...overrides }
  const line = {
    id: randomUUID(),
    tenantId: TENANT,
    organizationId: ORG,
    cartId,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lineKey: cartLineKey(base.productId as string, (base.variantId as string | null) ?? null, Boolean(base.giftWrap), (base.giftMessage as string | null) ?? null),
    ...base,
  }
  em.lines.push(line)
  return line
}

function liveLines(em: FakeEm, cartId: string) {
  return em.lines.filter((line) => line.cartId === cartId && line.deletedAt === null)
}

/** repriceLines stub: every requested line is valid and costs ₹499 (gross). */
function priceEverything() {
  repriceLines.mockImplementation(async (_em, _scope, requests) => ({
    lines: (requests as Row[]).map((request, index) => ({
      index,
      productId: request.productId,
      variantId: request.variantId ?? null,
      quantity: request.quantity,
      giftWrap: request.giftWrap === true,
      giftMessage: (request.giftMessage as string | null | undefined) ?? null,
      title: 'Mug',
      variantName: null,
      sku: 'MUG',
      handle: 'mug',
      imageUrl: null,
      isCustomizable: false,
      maxQuantity: MAX_LINE_QUANTITY,
      amounts: { priceId: 'price-1', unitNet: 422.88, unitGross: 499, taxRate: 18, quantity: request.quantity, totalGross: 499 * (request.quantity as number), totalNet: 0, taxAmount: 76.12 * (request.quantity as number) },
    })),
    issues: [],
  }))
}

beforeEach(() => {
  repriceLines.mockReset()
  priceEverything()
})

describe('resolveCart — anonymous shoppers', () => {
  it('creates a cart and sets an httpOnly token cookie, storing only the token hash', async () => {
    const em = new FakeEm()
    const { cart, cookies } = await resolveCart(em as never, SCOPE, { customer: null, token: null }, true)
    expect(cart).toMatchObject({ tenantId: TENANT, organizationId: ORG, customerUserId: null, status: 'active', currencyCode: 'INR' })
    expect(cookies).toHaveLength(1)
    expect(cookies[0]!.name).toBe(CART_COOKIE)
    expect(cookies[0]!.maxAge).toBeGreaterThan(0)
    // The raw token only ever reaches the cookie; the database holds its SHA-256.
    expect((cart as Row).tokenHash).toBe(hashToken(cookies[0]!.value))
    expect((cart as Row).tokenHash).not.toBe(cookies[0]!.value)
  })

  it('does not create a cart on reads', async () => {
    const em = new FakeEm()
    const { cart, cookies } = await resolveCart(em as never, SCOPE, { customer: null, token: null }, false)
    expect(cart).toBeNull()
    expect(cookies).toEqual([])
    expect(em.create).not.toHaveBeenCalled()
  })

  it('finds the cart by token hash within the resolved shop', async () => {
    const em = new FakeEm()
    const existing = seedCart(em, { tokenHash: hashToken(TOKEN) })
    const { cart } = await resolveCart(em as never, SCOPE, { customer: null, token: TOKEN }, false)
    expect(cart).toBe(existing)
    expect(em.findOne).toHaveBeenCalledWith(
      StorefrontCart,
      expect.objectContaining({ tenantId: TENANT, organizationId: ORG, deletedAt: null, tokenHash: hashToken(TOKEN), status: 'active' }),
    )
  })

  it("never returns another tenant's or organization's cart for the same token", async () => {
    const em = new FakeEm()
    seedCart(em, { tokenHash: hashToken(TOKEN), tenantId: OTHER_TENANT })
    seedCart(em, { tokenHash: hashToken(TOKEN), organizationId: OTHER_ORG })
    const { cart, cookies } = await resolveCart(em as never, SCOPE, { customer: null, token: TOKEN }, false)
    expect(cart).toBeNull()
    // Unknown token: the stale cookie is cleared.
    expect(cookies).toEqual([{ name: CART_COOKIE, value: '', maxAge: 0 }])
  })

  it('ignores converted carts (a placed order does not keep its cart open)', async () => {
    const em = new FakeEm()
    seedCart(em, { tokenHash: hashToken(TOKEN), status: CART_STATUS.converted })
    const { cart } = await resolveCart(em as never, SCOPE, { customer: null, token: TOKEN }, true)
    expect(cart).not.toBeNull()
    expect((cart as Row).status).toBe('active')
    expect(em.carts).toHaveLength(2)
  })
})

describe('resolveCart — signed-in customers (merge on login)', () => {
  it('adopts an anonymous cart when the customer has none, and clears the cookie', async () => {
    const em = new FakeEm()
    const anonymous = seedCart(em, { tokenHash: hashToken(TOKEN) })
    const { cart, cookies } = await resolveCart(em as never, SCOPE, { customer: CUSTOMER, token: TOKEN }, false)
    expect(cart).toBe(anonymous)
    expect(anonymous.customerUserId).toBe((CUSTOMER as Row).sub)
    expect(anonymous.tokenHash).toBeNull()
    expect(cookies).toEqual([{ name: CART_COOKIE, value: '', maxAge: 0 }])
    expect(em.flush).toHaveBeenCalled()
  })

  it('merges anonymous lines into the existing customer cart, summing identical lines', async () => {
    const em = new FakeEm()
    const customerCart = seedCart(em, { customerUserId: (CUSTOMER as Row).sub })
    const anonymous = seedCart(em, { tokenHash: hashToken(TOKEN) })
    seedLine(em, customerCart.id as string, { quantity: 2 })
    seedLine(em, anonymous.id as string, { quantity: 3 }) // same product/variant/gift -> same key
    seedLine(em, anonymous.id as string, { productId: PRODUCT_B, giftWrap: true, giftMessage: 'Happy birthday' })

    const { cart } = await resolveCart(em as never, SCOPE, { customer: CUSTOMER, token: TOKEN }, false)
    expect(cart).toBe(customerCart)
    const lines = liveLines(em, customerCart.id as string)
    expect(lines).toHaveLength(2)
    expect(lines.find((line) => line.productId === PRODUCT)!.quantity).toBe(5)
    expect(lines.find((line) => line.productId === PRODUCT_B)).toMatchObject({ giftWrap: true, giftMessage: 'Happy birthday', tenantId: TENANT, organizationId: ORG })
    expect(anonymous.status).toBe(CART_STATUS.merged)
    expect(anonymous.tokenHash).toBeNull()
  })

  it('caps merged quantities at the per-line maximum', async () => {
    const em = new FakeEm()
    const customerCart = seedCart(em, { customerUserId: (CUSTOMER as Row).sub })
    const anonymous = seedCart(em, { tokenHash: hashToken(TOKEN) })
    seedLine(em, customerCart.id as string, { quantity: MAX_LINE_QUANTITY - 1 })
    seedLine(em, anonymous.id as string, { quantity: 5 })
    await resolveCart(em as never, SCOPE, { customer: CUSTOMER, token: TOKEN }, false)
    expect(liveLines(em, customerCart.id as string)[0]!.quantity).toBe(MAX_LINE_QUANTITY)
  })

  it("never merges or adopts a cart already owned by another customer", async () => {
    const em = new FakeEm()
    const someoneElses = seedCart(em, { tokenHash: hashToken(TOKEN), customerUserId: 'bbbbbbbb-0000-4000-8000-000000000002' })
    const { cart } = await resolveCart(em as never, SCOPE, { customer: CUSTOMER, token: TOKEN }, true)
    expect(cart).not.toBe(someoneElses)
    expect(someoneElses.customerUserId).toBe('bbbbbbbb-0000-4000-8000-000000000002')
    expect((cart as Row).customerUserId).toBe((CUSTOMER as Row).sub)
  })

  it("does not pick up the customer's cart from another organization", async () => {
    const em = new FakeEm()
    seedCart(em, { customerUserId: (CUSTOMER as Row).sub, organizationId: OTHER_ORG })
    const { cart } = await resolveCart(em as never, SCOPE, { customer: CUSTOMER, token: null }, false)
    expect(cart).toBeNull()
  })
})

describe('addCartLine', () => {
  it('stores catalog-validated lines and increments quantity for an identical line', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    await addCartLine(em as never, SCOPE, cart as never, { productId: PRODUCT, variantId: null, quantity: 2, giftWrap: false, giftMessage: null }, translate)
    await addCartLine(em as never, SCOPE, cart as never, { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: null }, translate)
    const lines = liveLines(em, cart.id as string)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ quantity: 3, tenantId: TENANT, organizationId: ORG })
  })

  it('keeps lines with different gift options apart', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    await addCartLine(em as never, SCOPE, cart as never, { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: null }, translate)
    await addCartLine(em as never, SCOPE, cart as never, { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: true, giftMessage: null }, translate)
    await addCartLine(em as never, SCOPE, cart as never, { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: 'For Asha' }, translate)
    expect(liveLines(em, cart.id as string)).toHaveLength(3)
  })

  it('rejects lines with catalog issues (422 cart_invalid) and stores nothing', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    repriceLines.mockResolvedValueOnce({
      lines: [],
      issues: [{ index: 0, productId: PRODUCT, variantId: null, code: 'gift_message_too_long', maxLength: 10 }],
    })
    const error = await addCartLine(
      em as never,
      SCOPE,
      cart as never,
      { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: 'x'.repeat(11) },
      translate,
    ).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(StorefrontError)
    expect(error).toMatchObject({ status: 422, code: 'cart_invalid' })
    expect((error as StorefrontError).extra).toEqual({
      details: [{ index: 0, productId: PRODUCT, variantId: null, code: 'gift_message_too_long', maxLength: 10 }],
    })
    expect(em.lines).toHaveLength(0)
  })

  it('validates against the resolved scope (prices come from this shop’s catalog)', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    await addCartLine(em as never, SCOPE, cart as never, { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: null }, translate)
    expect(repriceLines).toHaveBeenCalledWith(em, SCOPE, [expect.objectContaining({ productId: PRODUCT })])
  })

  it(`refuses a new line once the cart holds ${MAX_CART_LINES} lines, but still merges into an existing one`, async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    for (let index = 0; index < MAX_CART_LINES; index += 1) {
      seedLine(em, cart.id as string, { productId: randomUUID() })
    }
    const full = await addCartLine(em as never, SCOPE, cart as never, { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: null }, translate).catch(
      (err: unknown) => err,
    )
    expect(full).toMatchObject({ status: 422, code: 'cart_line_limit' })

    const existingProduct = em.lines[0]!.productId as string
    await addCartLine(em as never, SCOPE, cart as never, { productId: existingProduct, variantId: null, quantity: 1, giftWrap: false, giftMessage: null }, translate)
    expect(em.lines[0]!.quantity).toBe(2)
  })

  it('retries once when a concurrent request inserted the same line key (unique violation)', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    em.flush.mockImplementationOnce(async () => {
      throw Object.assign(new Error('duplicate key'), { code: '23505' })
    })
    await addCartLine(em as never, SCOPE, cart as never, { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: null }, translate)
    expect(em.clear).toHaveBeenCalledTimes(1)
    expect(em.flush).toHaveBeenCalledTimes(2)
  })

  it('does not swallow other database errors', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    em.flush.mockImplementationOnce(async () => {
      throw new Error('connection reset')
    })
    await expect(
      addCartLine(em as never, SCOPE, cart as never, { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: null }, translate),
    ).rejects.toThrow('connection reset')
  })
})

describe('updateCartLine', () => {
  it('changes quantity and gift options after re-validating the line', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    const line = seedLine(em, cart.id as string)
    await updateCartLine(em as never, SCOPE, cart as never, line.id as string, { quantity: 4, giftMessage: '  With love \r\n' }, translate)
    expect(line).toMatchObject({ quantity: 4, giftMessage: 'With love', lineKey: cartLineKey(PRODUCT, null, false, 'With love') })
    expect(repriceLines).toHaveBeenCalledWith(em, SCOPE, [expect.objectContaining({ quantity: 4, giftMessage: 'With love' })])
  })

  it('clears the gift message when null is sent', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    const line = seedLine(em, cart.id as string, { giftMessage: 'Old' })
    await updateCartLine(em as never, SCOPE, cart as never, line.id as string, { giftMessage: null }, translate)
    expect(line.giftMessage).toBeNull()
  })

  it('folds a line into its twin when gift options become identical', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    const plain = seedLine(em, cart.id as string, { quantity: 2 })
    const wrapped = seedLine(em, cart.id as string, { quantity: 3, giftWrap: true })
    await updateCartLine(em as never, SCOPE, cart as never, wrapped.id as string, { giftWrap: false }, translate)
    expect(plain.quantity).toBe(5)
    expect(wrapped.deletedAt).toBeInstanceOf(Date)
  })

  it('returns 404 for a line of another cart (no cross-cart edits)', async () => {
    const em = new FakeEm()
    const mine = seedCart(em)
    const theirs = seedCart(em, { tokenHash: 'other' })
    const foreign = seedLine(em, theirs.id as string)
    await expect(updateCartLine(em as never, SCOPE, mine as never, foreign.id as string, { quantity: 2 }, translate)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
    expect(foreign.quantity).toBe(1)
  })

  it('rejects an update that breaks a catalog rule and leaves the line untouched', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    const line = seedLine(em, cart.id as string)
    repriceLines.mockResolvedValueOnce({ lines: [], issues: [{ index: 0, productId: PRODUCT, variantId: null, code: 'gift_wrap_unavailable' }] })
    await expect(updateCartLine(em as never, SCOPE, cart as never, line.id as string, { giftWrap: true }, translate)).rejects.toMatchObject({
      status: 422,
      code: 'cart_invalid',
    })
    expect(line.giftWrap).toBe(false)
  })
})

describe('removeCartLine / clearCart / replaceCartLines', () => {
  it('soft-deletes a line only inside the same cart and scope', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    const line = seedLine(em, cart.id as string)
    await removeCartLine(em as never, SCOPE, cart as never, line.id as string, translate)
    expect(line.deletedAt).toBeInstanceOf(Date)
    expect(em.nativeUpdate).toHaveBeenCalledWith(
      StorefrontCartLine,
      expect.objectContaining({ id: line.id, cartId: cart.id, tenantId: TENANT, organizationId: ORG, deletedAt: null }),
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    )
  })

  it('reports 404 when removing a line that is not in this cart', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    const other = seedCart(em)
    const line = seedLine(em, other.id as string)
    await expect(removeCartLine(em as never, SCOPE, cart as never, line.id as string, translate)).rejects.toMatchObject({ status: 404 })
    expect(line.deletedAt).toBeNull()
  })

  it('clearCart soft-deletes every line (no hard delete)', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    seedLine(em, cart.id as string)
    seedLine(em, cart.id as string, { productId: PRODUCT_B })
    await clearCart(em as never, SCOPE, cart as never)
    expect(em.lines).toHaveLength(2)
    expect(liveLines(em, cart.id as string)).toHaveLength(0)
  })

  it('replaceCartLines swaps the cart content inside one transaction, merging duplicates', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    const old = seedLine(em, cart.id as string, { productId: PRODUCT_B })
    await replaceCartLines(
      em as never,
      SCOPE,
      cart as never,
      [
        { productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: null },
        { productId: PRODUCT, variantId: null, quantity: 2, giftWrap: false, giftMessage: null },
      ],
      translate,
    )
    expect(em.transactional).toHaveBeenCalledTimes(1)
    expect(old.deletedAt).toBeInstanceOf(Date)
    const lines = liveLines(em, cart.id as string)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.quantity).toBe(3)
  })

  it('replaceCartLines validates before touching the cart', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    const old = seedLine(em, cart.id as string)
    repriceLines.mockResolvedValueOnce({ lines: [], issues: [{ index: 0, productId: PRODUCT_B, variantId: null, code: 'product_unavailable' }] })
    await expect(
      replaceCartLines(em as never, SCOPE, cart as never, [{ productId: PRODUCT_B, variantId: null, quantity: 1, giftWrap: false, giftMessage: null }], translate),
    ).rejects.toMatchObject({ code: 'cart_invalid' })
    expect(old.deletedAt).toBeNull()
    expect(em.transactional).not.toHaveBeenCalled()
  })
})

describe('cart view and conversion', () => {
  it('re-prices every line on read and totals in paise', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    seedLine(em, cart.id as string, { quantity: 2 })
    seedLine(em, cart.id as string, { productId: PRODUCT_B, giftWrap: true, giftMessage: 'Hi' })
    const view = await buildCartView(em as never, SCOPE, cart as never)
    expect(view.lines).toHaveLength(2)
    expect(view.totals).toEqual({ subtotal: 1497, tax: 228.36, itemCount: 3 })
    expect(view.hasIssues).toBe(false)
    expect(view.lines[1]!.gift).toEqual({ giftWrap: true, giftMessage: 'Hi' })
  })

  it('keeps unavailable lines visible with an issue code and excludes them from totals', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    seedLine(em, cart.id as string)
    seedLine(em, cart.id as string, { productId: PRODUCT_B })
    repriceLines.mockImplementationOnce(async () => ({
      lines: [
        {
          index: 0,
          productId: PRODUCT,
          variantId: null,
          quantity: 1,
          giftWrap: false,
          giftMessage: null,
          title: 'Mug',
          variantName: null,
          sku: null,
          handle: 'mug',
          imageUrl: null,
          isCustomizable: false,
          maxQuantity: 20,
          amounts: { priceId: 'p', unitNet: 100, unitGross: 100, taxRate: 0, quantity: 1, totalGross: 100, totalNet: 100, taxAmount: 0 },
        },
      ],
      issues: [{ index: 1, productId: PRODUCT_B, variantId: null, code: 'product_unavailable' }],
    }))
    const view = await buildCartView(em as never, SCOPE, cart as never)
    expect(view.hasIssues).toBe(true)
    expect(view.lines[1]).toMatchObject({ available: false, issue: 'product_unavailable', unitPriceGross: null })
    expect(view.totals.subtotal).toBe(100)
  })

  it('an absent cart renders as an empty INR cart', async () => {
    const view = await buildCartView(new FakeEm() as never, SCOPE, null)
    expect(view).toMatchObject({ id: null, currencyCode: 'INR', lines: [], totals: { subtotal: 0, tax: 0, itemCount: 0 } })
  })

  it('cartLineInputs exposes only product, variant, quantity and gift options (never prices)', async () => {
    const em = new FakeEm()
    const cart = seedCart(em)
    seedLine(em, cart.id as string, { quantity: 2, giftMessage: 'x' })
    expect(await cartLineInputs(em as never, SCOPE, cart as never)).toEqual([
      { productId: PRODUCT, variantId: null, quantity: 2, giftWrap: false, giftMessage: 'x' },
    ])
  })

  it('markCartConverted closes the cart and drops the anonymous token', async () => {
    const em = new FakeEm()
    const cart = seedCart(em, { tokenHash: hashToken(TOKEN) })
    await markCartConverted(em as never, cart as never, 'order-1')
    expect(cart).toMatchObject({ status: 'converted', convertedOrderId: 'order-1', tokenHash: null })
  })
})
