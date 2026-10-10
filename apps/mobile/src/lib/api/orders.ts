import { z } from 'zod'
import { apiRequest } from './http'
import type { Address } from './checkout'
import type { ListEnvelope } from './catalog'

/**
 * Order history — `apps/mercato`'s `storefront` module order routes, called directly:
 *
 *   GET /api/storefront/orders/{id}   works for the owning signed-in customer OR a guest holding
 *                                      the `sf_order_access` cookie set at checkout time. This is
 *                                      the endpoint TASK-08 uses for guest "my orders" lookups.
 *   GET /api/storefront/orders        requires a signed-in customer (`requireCustomer()`).
 *                                      Implemented for the fast-follow once real auth lands —
 *                                      unused in guest-only v1.
 *
 * Wire field names are cross-checked against `apps/storefront/src/lib/api/orders.ts`'s
 * `orderSummaryWireSchema` / `fullOrderWireSchema` (its own live-verified wire schema for this
 * same endpoint set), with camelCase renames applied per TASK-04's "Contracts produced" (e.g.
 * `grandTotalGrossAmount` -> `grandTotalGrossMajor`, line `name` -> `productTitle`).
 *
 * FLAGGED DISCREPANCY: the storefront's cross-checked `fullOrderWireSchema` for
 * `GET /storefront/orders/{id}` has no `payment{providerKey,transactionId,status}` object and no
 * `shippingAddress` field at all (the storefront UI never needed either). TASK-04's contract
 * requires both as non-optional on `OrderDetail`. Both are read here as optional/passthrough and
 * defaulted (payment falls back to the order's own `status`/`paymentStatus`; shippingAddress falls
 * back to an empty address) when the backend doesn't send them — this should be re-verified
 * against a live response before TASK-08 relies on either field.
 */

export interface OrderSummary {
  id: string
  orderNumber: string
  placedAt: string
  currencyCode: string
  grandTotalGrossMajor: number
  status: string
  paymentStatus: string
  lineItemCount: number
}

export interface OrderLine {
  id: string
  productTitle: string
  quantity: number
  unitPriceMajor: number
  giftWrap?: boolean
  giftMessage?: string
}

export interface OrderDetail extends OrderSummary {
  lines: OrderLine[]
  payment: { providerKey: string; transactionId: string; status: string }
  shippingAddress: Address
}

/* ------------------------------------------------------------------------------------------ */
/* Wire schemas                                                                                */
/* ------------------------------------------------------------------------------------------ */

const decimal = z.union([z.number(), z.string()]).nullable().optional()

function numberOf(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

const orderSummaryWireSchema = z
  .object({
    id: z.string(),
    orderNumber: z.string(),
    placedAt: z.string().nullable().optional(),
    currencyCode: z.string().nullable().optional(),
    grandTotalGrossAmount: decimal,
    status: z.string().nullable().optional(),
    paymentStatus: z.string().nullable().optional(),
    lineItemCount: z.number().int().nullable().optional(),
  })
  .passthrough()

const orderListWireSchema = z
  .object({
    items: z.array(orderSummaryWireSchema),
    total: z.number().optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
    totalPages: z.number().optional(),
  })
  .passthrough()

const addressWireSchema = z
  .object({
    fullName: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string().nullable().optional(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string(),
  })
  .passthrough()

const orderDetailWireSchema = z
  .object({
    id: z.string(),
    orderNumber: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    paymentStatus: z.string().nullable().optional(),
    placedAt: z.string().nullable().optional(),
    currencyCode: z.string(),
    grandTotal: decimal,
    lineItemCount: z.number().int().nullable().optional(),
    lines: z.array(
      z
        .object({
          id: z.string(),
          name: z.string().nullable().optional(),
          quantity: z.union([z.number(), z.string()]),
          unitPriceGross: decimal,
          giftMessage: z.string().nullable().optional(),
          giftWrap: z.boolean().nullable().optional(),
        })
        .passthrough(),
    ),
    payment: z
      .object({
        providerKey: z.string().optional(),
        transactionId: z.string().optional(),
        status: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    shippingAddress: addressWireSchema.nullable().optional(),
  })
  .passthrough()

/* ------------------------------------------------------------------------------------------ */
/* Mapping                                                                                     */
/* ------------------------------------------------------------------------------------------ */

function toOrderSummary(wire: z.infer<typeof orderSummaryWireSchema>): OrderSummary {
  return {
    id: wire.id,
    orderNumber: wire.orderNumber,
    placedAt: wire.placedAt ?? '',
    currencyCode: wire.currencyCode ?? 'INR',
    grandTotalGrossMajor: numberOf(wire.grandTotalGrossAmount),
    status: wire.status ?? '',
    paymentStatus: wire.paymentStatus ?? '',
    lineItemCount: wire.lineItemCount ?? 0,
  }
}

const EMPTY_ADDRESS: Address = {
  fullName: '',
  phone: '',
  line1: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'IN',
}

/* ------------------------------------------------------------------------------------------ */
/* Client                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** Works for a guest holding `sf_order_access` or the owning signed-in customer. */
export async function getOrder(orderId: string): Promise<OrderDetail> {
  const res = await apiRequest(`/api/storefront/orders/${encodeURIComponent(orderId)}`, orderDetailWireSchema)
  return {
    id: res.id,
    orderNumber: res.orderNumber ?? '',
    placedAt: res.placedAt ?? '',
    currencyCode: res.currencyCode,
    grandTotalGrossMajor: numberOf(res.grandTotal),
    status: res.status ?? '',
    paymentStatus: res.paymentStatus ?? '',
    lineItemCount: res.lineItemCount ?? res.lines.length,
    lines: res.lines.map((line) => ({
      id: line.id,
      productTitle: line.name?.trim() || 'Item',
      quantity: Number(line.quantity) || 0,
      unitPriceMajor: numberOf(line.unitPriceGross),
      giftWrap: line.giftWrap ?? undefined,
      giftMessage: line.giftMessage ?? undefined,
    })),
    payment: {
      providerKey: res.payment?.providerKey ?? '',
      transactionId: res.payment?.transactionId ?? '',
      status: res.payment?.status ?? res.paymentStatus ?? '',
    },
    shippingAddress: res.shippingAddress
      ? {
          fullName: res.shippingAddress.fullName,
          phone: res.shippingAddress.phone,
          line1: res.shippingAddress.line1,
          line2: res.shippingAddress.line2 ?? undefined,
          city: res.shippingAddress.city,
          state: res.shippingAddress.state,
          postalCode: res.shippingAddress.postalCode,
          country: res.shippingAddress.country,
        }
      : EMPTY_ADDRESS,
  }
}

/** Requires a signed-in customer — unused in guest-only v1, implemented for the fast-follow. */
export async function listMyOrders(page = 1): Promise<ListEnvelope<OrderSummary>> {
  const res = await apiRequest('/api/storefront/orders', orderListWireSchema, { query: { page } })
  const items = res.items.map(toOrderSummary)
  return {
    items,
    total: res.total ?? items.length,
    page: res.page ?? page,
    pageSize: res.pageSize ?? items.length,
    totalPages: res.totalPages ?? 1,
  }
}
