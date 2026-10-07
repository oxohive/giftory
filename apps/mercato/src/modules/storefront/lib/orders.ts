import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { SalesOrder, SalesOrderLine } from '@open-mercato/core/modules/sales/data/entities'
import { StorefrontCheckout } from '../data/entities'
import { ORDER_ACCESS_COOKIE } from './constants'
import { shopperPaymentStatus } from './paymentState'
import { readLinkedPersonId } from './customerLink'
import { toNumberOrNull } from './pricing'
import type { ShopperContext, StorefrontScope } from './scope'
import { parseOrderAccess, readCookie, tokenMatchesHash } from './tokens'

/**
 * Shopper order reads (G5). An order is visible to:
 *  - the signed-in customer who placed it (`storefront_checkouts.customer_user_id`),
 *  - or whose linked CRM person is the order's customer (`sales_orders.customer_entity_id`),
 *  - or a guest presenting the order's access token cookie.
 * Anything else is reported as not found (no existence oracle).
 */

export type OrderRequester = {
  customerUserId: string | null
  personEntityId: string | null
  guestTokens: Map<string, string>
}

export async function resolveRequester(em: EntityManager, req: Request, shopper: ShopperContext): Promise<OrderRequester> {
  const guestTokens = new Map(parseOrderAccess(readCookie(req, ORDER_ACCESS_COOKIE)).map((entry) => [entry.orderId, entry.token]))
  if (!shopper.customer) return { customerUserId: null, personEntityId: null, guestTokens }
  const personEntityId = await readLinkedPersonId(em, shopper.scope, shopper.customer.sub)
  return { customerUserId: shopper.customer.sub, personEntityId, guestTokens }
}

async function checkoutsForOrder(em: EntityManager, scope: StorefrontScope, orderId: string) {
  return em.find(
    StorefrontCheckout,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, orderId } as FilterQuery<StorefrontCheckout>,
    { orderBy: { createdAt: 'desc' } as never },
  )
}

export async function loadAccessibleOrder(em: EntityManager, scope: StorefrontScope, orderId: string, requester: OrderRequester) {
  const order = await findOneWithDecryption(
    em,
    SalesOrder,
    { id: orderId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<SalesOrder>,
    undefined,
    scope,
  )
  if (!order) return null
  const checkouts = await checkoutsForOrder(em, scope, orderId)
  const allowed =
    (requester.customerUserId !== null && checkouts.some((checkout) => checkout.customerUserId === requester.customerUserId)) ||
    (requester.personEntityId !== null && order.customerEntityId === requester.personEntityId) ||
    (() => {
      const token = requester.guestTokens.get(orderId.toLowerCase())
      return Boolean(token && checkouts.some((checkout) => tokenMatchesHash(token, checkout.guestAccessTokenHash)))
    })()
  if (!allowed) return null
  return { order, checkouts }
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function money(value: unknown): number | null {
  const numeric = toNumberOrNull(value)
  return numeric === null ? null : Math.round(numeric * 100) / 100
}

function shopperOrderStatus(order: SalesOrder, paymentStatus: string | null): string | null {
  if (order.status) return order.status
  if (paymentStatus === 'pending' || paymentStatus === null) return 'pending_payment'
  if (paymentStatus === 'failed' || paymentStatus === 'cancelled' || paymentStatus === 'expired') return 'payment_failed'
  return null
}

function readGift(metadata: unknown): { giftWrap: boolean | null; giftMessage: string | null } {
  if (!metadata || typeof metadata !== 'object') return { giftWrap: null, giftMessage: null }
  const record = metadata as Record<string, unknown>
  const gift = record.gift && typeof record.gift === 'object' ? (record.gift as Record<string, unknown>) : record
  return {
    giftWrap: typeof gift.giftWrap === 'boolean' ? gift.giftWrap : null,
    giftMessage: typeof gift.giftMessage === 'string' ? gift.giftMessage : null,
  }
}

function readSnapshotImage(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const value = (snapshot as Record<string, unknown>).imageUrl
  return typeof value === 'string' ? value : null
}

function readSnapshotHandle(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const value = (snapshot as Record<string, unknown>).handle
  return typeof value === 'string' ? value : null
}

function publicAddress(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const record = snapshot as Record<string, unknown>
  const text = (key: string) => (typeof record[key] === 'string' ? (record[key] as string) : null)
  return {
    fullName: text('name'),
    phone: text('phone'),
    line1: text('addressLine1'),
    line2: text('addressLine2'),
    city: text('city'),
    state: text('region'),
    postalCode: text('postalCode'),
    country: text('country'),
  }
}

export async function serializeOrderDetail(em: EntityManager, scope: StorefrontScope, order: SalesOrder, checkouts: StorefrontCheckout[]) {
  const lines = await findWithDecryption(
    em,
    SalesOrderLine,
    { order: order.id, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<SalesOrderLine>,
    { orderBy: { lineNumber: 'asc' } } as never,
    scope,
  )
  const paymentStatus = shopperPaymentStatus(order, checkouts)
  const latest = checkouts.find((checkout) => checkout.gatewayTransactionId) ?? null
  return {
    id: String(order.id),
    orderNumber: order.orderNumber ?? null,
    status: shopperOrderStatus(order, paymentStatus),
    paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus ?? null,
    placedAt: iso(order.placedAt ?? order.createdAt),
    currencyCode: order.currencyCode,
    subtotal: Math.max(0, Math.round(((money(order.subtotalGrossAmount) ?? 0) - (money(order.shippingGrossAmount) ?? 0)) * 100) / 100),
    shippingTotal: money(order.shippingGrossAmount),
    taxTotal: money(order.taxTotalAmount),
    discountTotal: money(order.discountTotalAmount),
    grandTotal: money(order.grandTotalGrossAmount),
    paidTotal: money(order.paidTotalAmount),
    outstandingAmount: money(order.outstandingAmount),
    shippingMethod: order.shippingMethodCode ?? null,
    shippingAddress: publicAddress(order.shippingAddressSnapshot),
    billingAddress: publicAddress(order.billingAddressSnapshot),
    payment: latest
      ? { providerKey: latest.providerKey, transactionId: latest.gatewayTransactionId ?? null, status: latest.paymentStatus }
      : null,
    lines: lines
      .filter((line) => !line.kind || line.kind === 'product' || line.kind === 'service')
      .map((line) => {
        const gift = readGift(line.metadata)
        return {
          id: String(line.id),
          productId: line.productId ?? null,
          variantId: line.productVariantId ?? null,
          name: line.name ?? null,
          sku: (line.catalogSnapshot as Record<string, unknown> | null | undefined)?.sku ?? null,
          slug: readSnapshotHandle(line.catalogSnapshot),
          imageUrl: readSnapshotImage(line.catalogSnapshot),
          quantity: Number(line.quantity ?? 0),
          unitPriceGross: money(line.unitPriceGross),
          totalGross: money(line.totalGrossAmount),
          giftWrap: gift.giftWrap,
          giftMessage: gift.giftMessage,
        }
      }),
  }
}

export async function listCustomerOrders(
  em: EntityManager,
  scope: StorefrontScope,
  requester: OrderRequester,
  page: number,
  pageSize: number,
) {
  if (!requester.customerUserId) return { items: [], total: 0, page, pageSize }
  const placed = await em.find(
    StorefrontCheckout,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, customerUserId: requester.customerUserId, orderId: { $ne: null } } as FilterQuery<StorefrontCheckout>,
    { fields: ['orderId'] as never },
  )
  const orderIds = Array.from(new Set(placed.map((checkout) => checkout.orderId).filter((id): id is string => !!id)))
  const or: Record<string, unknown>[] = []
  if (orderIds.length) or.push({ id: { $in: orderIds } })
  if (requester.personEntityId) or.push({ customerEntityId: requester.personEntityId })
  if (!or.length) return { items: [], total: 0, page, pageSize }
  const where = { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null, $or: or } as FilterQuery<SalesOrder>
  const [orders, total] = await Promise.all([
    findWithDecryption(
      em,
      SalesOrder,
      where,
      { orderBy: { placedAt: 'desc', createdAt: 'desc' }, limit: pageSize, offset: (page - 1) * pageSize } as never,
      scope,
    ),
    em.count(SalesOrder, where),
  ])
  const checkouts = orders.length
    ? await em.find(
        StorefrontCheckout,
        { tenantId: scope.tenantId, organizationId: scope.organizationId, orderId: { $in: orders.map((order) => order.id) } } as FilterQuery<StorefrontCheckout>,
        { orderBy: { createdAt: 'desc' } as never },
      )
    : []
  return {
    items: orders.map((order) => {
      const own = checkouts.filter((checkout) => checkout.orderId === order.id)
      const paymentStatus = shopperPaymentStatus(order, own)
      return {
        id: String(order.id),
        orderNumber: order.orderNumber,
        placedAt: iso(order.placedAt ?? order.createdAt),
        currencyCode: order.currencyCode ?? null,
        grandTotalGrossAmount: money(order.grandTotalGrossAmount),
        status: shopperOrderStatus(order, paymentStatus),
        paymentStatus,
        lineItemCount: Number(order.lineItemCount ?? 0),
      }
    }),
    total,
    page,
    pageSize,
  }
}
