import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isUniqueViolation } from '@open-mercato/shared/lib/crud/errors'
import { StorefrontCart, StorefrontCartLine } from '../data/entities'
import type { CartLineInput, CartLineUpdate } from '../data/validators'
import { repriceLines, type LineIssue, type PricedLine } from './catalog'
import {
  CART_COOKIE,
  CART_COOKIE_MAX_AGE_SECONDS,
  CART_STATUS,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  STOREFRONT_CURRENCY,
} from './constants'
import { cartLineKey, normalizeGiftMessage } from './giftOptions'
import { StorefrontError, type CookieSpec, type Translate } from './http'
import { summarizeTotals } from './pricing'
import type { StorefrontScope } from './scope'
import { generateToken, hashToken, readCartToken } from './tokens'

/**
 * Server-side cart (G2). A cart belongs to an anonymous token (cookie, hash
 * stored) or to a signed-in customer. When a customer arrives with an
 * anonymous cart cookie, the anonymous lines are merged into their cart.
 * Lines store only variant + quantity + gift options; every read re-prices
 * from the catalog.
 */

export type CartOwner = { customer: CustomerAuthContext | null; token: string | null }

export type CartSession = {
  cart: StorefrontCart | null
  cookies: CookieSpec[]
}

function cartWhere(scope: StorefrontScope, extra: Record<string, unknown>): FilterQuery<StorefrontCart> {
  return { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null, ...extra } as FilterQuery<StorefrontCart>
}

export function readCartOwner(req: Request, customer: CustomerAuthContext | null): CartOwner {
  return { customer, token: readCartToken(req, CART_COOKIE) }
}

async function loadLines(em: EntityManager, scope: StorefrontScope, cartId: string): Promise<StorefrontCartLine[]> {
  return findWithDecryption(
    em,
    StorefrontCartLine,
    { cartId, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<StorefrontCartLine>,
    { orderBy: { createdAt: 'asc', id: 'asc' } } as never,
    scope,
  )
}

function createCart(em: EntityManager, scope: StorefrontScope, owner: { customerUserId?: string | null; tokenHash?: string | null }) {
  return em.create(StorefrontCart, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    customerUserId: owner.customerUserId ?? null,
    tokenHash: owner.tokenHash ?? null,
    currencyCode: STOREFRONT_CURRENCY,
    status: CART_STATUS.active,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

/** Add `quantity` of a line into a cart, merging identical (product, variant, gift) lines. */
function upsertLine(
  em: EntityManager,
  scope: StorefrontScope,
  cartId: string,
  existing: StorefrontCartLine[],
  input: { productId: string; variantId: string | null; quantity: number; giftWrap: boolean; giftMessage: string | null },
): StorefrontCartLine {
  const key = cartLineKey(input.productId, input.variantId, input.giftWrap, input.giftMessage)
  const match = existing.find((line) => line.lineKey === key)
  if (match) {
    match.quantity = Math.min(MAX_LINE_QUANTITY, match.quantity + input.quantity)
    match.updatedAt = new Date()
    return match
  }
  const line = em.create(StorefrontCartLine, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    cartId,
    productId: input.productId,
    variantId: input.variantId,
    quantity: Math.min(MAX_LINE_QUANTITY, input.quantity),
    giftWrap: input.giftWrap,
    giftMessage: input.giftMessage,
    lineKey: key,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  existing.push(line)
  return line
}

/**
 * Resolve (and optionally create) the requester's active cart. Signed-in
 * customers adopt or merge an anonymous cart presented by cookie; the cookie
 * is then cleared.
 */
export async function resolveCart(em: EntityManager, scope: StorefrontScope, owner: CartOwner, create: boolean): Promise<CartSession> {
  const cookies: CookieSpec[] = []
  const anonymous = owner.token
    ? await em.findOne(StorefrontCart, cartWhere(scope, { tokenHash: hashToken(owner.token), status: CART_STATUS.active }))
    : null

  if (owner.customer) {
    let cart = await em.findOne(
      StorefrontCart,
      cartWhere(scope, { customerUserId: owner.customer.sub, status: CART_STATUS.active }),
      { orderBy: { updatedAt: 'desc' } as never },
    )
    if (anonymous && anonymous.customerUserId === null) {
      if (!cart) {
        anonymous.customerUserId = owner.customer.sub
        anonymous.tokenHash = null
        cart = anonymous
      } else {
        const target = await loadLines(em, scope, cart.id)
        for (const line of await loadLines(em, scope, anonymous.id)) {
          if (target.length >= MAX_CART_LINES) break
          upsertLine(em, scope, cart.id, target, {
            productId: line.productId,
            variantId: line.variantId ?? null,
            quantity: line.quantity,
            giftWrap: line.giftWrap,
            giftMessage: line.giftMessage ?? null,
          })
        }
        anonymous.status = CART_STATUS.merged
        anonymous.tokenHash = null
      }
      await em.flush()
      cookies.push({ name: CART_COOKIE, value: '', maxAge: 0 })
    } else if (owner.token && !anonymous) {
      cookies.push({ name: CART_COOKIE, value: '', maxAge: 0 })
    }
    if (!cart && create) {
      cart = createCart(em, scope, { customerUserId: owner.customer.sub })
      await em.flush()
    }
    return { cart: cart ?? null, cookies }
  }

  if (anonymous) return { cart: anonymous, cookies }
  if (!create) {
    if (owner.token) cookies.push({ name: CART_COOKIE, value: '', maxAge: 0 })
    return { cart: null, cookies }
  }
  const token = generateToken()
  const cart = createCart(em, scope, { tokenHash: hashToken(token) })
  await em.flush()
  cookies.push({ name: CART_COOKIE, value: token, maxAge: CART_COOKIE_MAX_AGE_SECONDS })
  return { cart, cookies }
}

export type CartLineView = {
  id: string
  key: string
  productId: string
  variantId: string | null
  slug: string
  title: string | null
  variantName: string | null
  sku: string | null
  imageUrl: string | null
  quantity: number
  maxQuantity: number | null
  currencyCode: string
  unitPriceNet: number | null
  unitPriceGross: number | null
  totalGross: number | null
  gift: { giftWrap: boolean; giftMessage: string | null }
  isCustomizable: boolean
  available: boolean
  issue: LineIssue['code'] | null
}

export type CartView = {
  id: string | null
  currencyCode: string
  lines: CartLineView[]
  totals: { subtotal: number; tax: number; itemCount: number }
  hasIssues: boolean
  updatedAt: string | null
}

export function emptyCartView(): CartView {
  return { id: null, currencyCode: STOREFRONT_CURRENCY, lines: [], totals: { subtotal: 0, tax: 0, itemCount: 0 }, hasIssues: false, updatedAt: null }
}

export async function buildCartView(em: EntityManager, scope: StorefrontScope, cart: StorefrontCart | null): Promise<CartView> {
  if (!cart) return emptyCartView()
  const lines = await loadLines(em, scope, cart.id)
  const { lines: priced, issues } = await repriceLines(
    em,
    scope,
    lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId ?? null,
      quantity: line.quantity,
      giftWrap: line.giftWrap,
      giftMessage: line.giftMessage ?? null,
    })),
  )
  const pricedByIndex = new Map<number, PricedLine>(priced.map((line) => [line.index, line]))
  const issueByIndex = new Map<number, LineIssue>(issues.map((issue) => [issue.index, issue]))
  const views: CartLineView[] = lines.map((line, index) => {
    const price = pricedByIndex.get(index)
    const issue = issueByIndex.get(index)
    return {
      id: line.id,
      key: line.lineKey,
      productId: line.productId,
      variantId: price?.variantId ?? line.variantId ?? null,
      slug: price?.handle ?? line.productId,
      title: price?.title ?? null,
      variantName: price?.variantName ?? null,
      sku: price?.sku ?? null,
      imageUrl: price?.imageUrl ?? null,
      quantity: line.quantity,
      maxQuantity: price?.maxQuantity ?? null,
      currencyCode: STOREFRONT_CURRENCY,
      unitPriceNet: price?.amounts.unitNet ?? null,
      unitPriceGross: price?.amounts.unitGross ?? null,
      totalGross: price?.amounts.totalGross ?? null,
      gift: { giftWrap: line.giftWrap, giftMessage: line.giftMessage ?? null },
      isCustomizable: price?.isCustomizable ?? false,
      available: Boolean(price),
      issue: issue?.code ?? null,
    }
  })
  const totals = summarizeTotals(priced.map((line) => line.amounts), 0)
  return {
    id: cart.id,
    currencyCode: STOREFRONT_CURRENCY,
    lines: views,
    totals: { subtotal: totals.subtotal, tax: totals.tax, itemCount: priced.reduce((sum, line) => sum + line.quantity, 0) },
    hasIssues: issues.length > 0,
    updatedAt: cart.updatedAt ? new Date(cart.updatedAt).toISOString() : null,
  }
}

function issuesError(translate: Translate, issues: LineIssue[]): StorefrontError {
  return new StorefrontError(422, 'cart_invalid', translate('storefront.errors.cartInvalid', 'Some items cannot be added to the cart'), {
    details: issues.map((issue) => ({
      index: issue.index,
      productId: issue.productId,
      variantId: issue.variantId,
      code: issue.code,
      ...(issue.maxLength !== undefined ? { maxLength: issue.maxLength } : {}),
    })),
  })
}

/** Validate candidate lines against the catalog before they are stored. */
async function assertLinesValid(em: EntityManager, scope: StorefrontScope, inputs: CartLineInput[], translate: Translate) {
  const { lines, issues } = await repriceLines(em, scope, inputs)
  if (issues.length) throw issuesError(translate, issues)
  return lines
}

async function withLineKeyRetry<T>(em: EntityManager, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    // A concurrent request inserted the same line key: reload and apply once more.
    em.clear()
    return work()
  }
}

function touch(cart: StorefrontCart) {
  cart.updatedAt = new Date()
}

export async function addCartLine(em: EntityManager, scope: StorefrontScope, cart: StorefrontCart, input: CartLineInput, translate: Translate) {
  const [priced] = await assertLinesValid(em, scope, [input], translate)
  await withLineKeyRetry(em, async () => {
    const lines = await loadLines(em, scope, cart.id)
    const key = cartLineKey(priced!.productId, priced!.variantId, priced!.giftWrap, priced!.giftMessage)
    if (!lines.some((line) => line.lineKey === key) && lines.length >= MAX_CART_LINES) {
      throw new StorefrontError(422, 'cart_line_limit', translate('storefront.errors.cartLineLimit', 'Your cart is full'))
    }
    upsertLine(em, scope, cart.id, lines, {
      productId: priced!.productId,
      variantId: priced!.variantId,
      quantity: input.quantity,
      giftWrap: priced!.giftWrap,
      giftMessage: priced!.giftMessage,
    })
    touch(cart)
    await em.flush()
  })
}

export async function replaceCartLines(em: EntityManager, scope: StorefrontScope, cart: StorefrontCart, inputs: CartLineInput[], translate: Translate) {
  const priced = inputs.length ? await assertLinesValid(em, scope, inputs, translate) : []
  await em.transactional(async (tx) => {
    await tx.nativeDelete(StorefrontCartLine, { cartId: cart.id, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<StorefrontCartLine>)
    const lines: StorefrontCartLine[] = []
    for (const line of priced) {
      upsertLine(tx, scope, cart.id, lines, {
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        giftWrap: line.giftWrap,
        giftMessage: line.giftMessage,
      })
    }
    const managed = await tx.findOne(StorefrontCart, { id: cart.id } as FilterQuery<StorefrontCart>)
    if (managed) touch(managed)
    await tx.flush()
  })
}

export async function updateCartLine(
  em: EntityManager,
  scope: StorefrontScope,
  cart: StorefrontCart,
  lineId: string,
  patch: CartLineUpdate,
  translate: Translate,
) {
  const lines = await loadLines(em, scope, cart.id)
  const line = lines.find((candidate) => candidate.id === lineId)
  if (!line) throw new StorefrontError(404, 'not_found', translate('storefront.errors.cartLineNotFound', 'Cart item not found'))
  const next = {
    productId: line.productId,
    variantId: line.variantId ?? null,
    quantity: patch.quantity ?? line.quantity,
    giftWrap: patch.giftWrap ?? line.giftWrap,
    giftMessage: patch.giftMessage !== undefined ? normalizeGiftMessage(patch.giftMessage) : line.giftMessage ?? null,
  }
  const [priced] = await assertLinesValid(em, scope, [next], translate)
  const key = cartLineKey(priced!.productId, priced!.variantId, priced!.giftWrap, priced!.giftMessage)
  const twin = lines.find((candidate) => candidate.id !== line.id && candidate.lineKey === key)
  if (twin) {
    // Gift options now equal another line: fold into it.
    twin.quantity = Math.min(MAX_LINE_QUANTITY, twin.quantity + next.quantity)
    twin.updatedAt = new Date()
    em.remove(line)
  } else {
    line.quantity = next.quantity
    line.giftWrap = priced!.giftWrap
    line.giftMessage = priced!.giftMessage
    line.variantId = priced!.variantId
    line.lineKey = key
    line.updatedAt = new Date()
  }
  touch(cart)
  await em.flush()
}

export async function removeCartLine(em: EntityManager, scope: StorefrontScope, cart: StorefrontCart, lineId: string, translate: Translate) {
  const removed = await em.nativeDelete(StorefrontCartLine, {
    id: lineId,
    cartId: cart.id,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  } as FilterQuery<StorefrontCartLine>)
  if (removed === 0) throw new StorefrontError(404, 'not_found', translate('storefront.errors.cartLineNotFound', 'Cart item not found'))
  touch(cart)
  await em.flush()
}

export async function clearCart(em: EntityManager, scope: StorefrontScope, cart: StorefrontCart) {
  await em.nativeDelete(StorefrontCartLine, { cartId: cart.id, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<StorefrontCartLine>)
  touch(cart)
  await em.flush()
}

/** Line inputs of the requester's cart, for checkout without body lines. */
export async function cartLineInputs(em: EntityManager, scope: StorefrontScope, cart: StorefrontCart): Promise<CartLineInput[]> {
  const lines = await loadLines(em, scope, cart.id)
  return lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId ?? null,
    quantity: line.quantity,
    giftWrap: line.giftWrap,
    giftMessage: line.giftMessage ?? null,
  }))
}

export async function markCartConverted(em: EntityManager, cart: StorefrontCart, orderId: string) {
  cart.status = CART_STATUS.converted
  cart.convertedOrderId = orderId
  cart.tokenHash = null
  touch(cart)
  await em.flush()
}
