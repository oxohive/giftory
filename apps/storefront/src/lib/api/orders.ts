import { z } from 'zod'
import { toMinorUnits } from '@/lib/money'
import { ApiError, bffRequest } from './http'

/**
 * Customer order history, served by the backend `storefront` module (GAP G5 closed):
 *   GET /api/storefront/orders?page=&pageSize=   signed-in customer's orders (placed through the storefront
 *                                                or belonging to the customer's linked CRM person)
 *   GET /api/storefront/orders/{id}              full detail: status, payment status (mirrors the gateway
 *                                                transaction), lines with prices and gift options, totals.
 *                                                Guests can read orders they just placed (sf_order_access cookie).
 *
 * The warranty_claims portal reads remain a fallback for backends without the storefront module:
 *   GET /api/warranty_claims/portal/orders, GET /api/warranty_claims/portal/orders/lines?orderId=
 */

const orderSummaryWireSchema = z
  .object({
    id: z.string(),
    orderNumber: z.string(),
    placedAt: z.string().nullable(),
    currencyCode: z.string().nullable(),
    grandTotalGrossAmount: z.union([z.string(), z.number()]).nullable(),
    status: z.string().nullable().optional(),
    paymentStatus: z.string().nullable().optional(),
  })
  .passthrough()

const orderListWireSchema = z
  .object({
    ok: z.literal(true),
    items: z.array(orderSummaryWireSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  })
  .passthrough()

const orderLinesWireSchema = z
  .object({
    ok: z.literal(true),
    order: z.object({ id: z.string(), placedAt: z.string().nullable() }).passthrough(),
    items: z.array(
      z
        .object({
          orderLineId: z.string(),
          productId: z.string().nullable(),
          variantId: z.string().nullable(),
          sku: z.string().nullable(),
          name: z.string().nullable(),
          quantity: z.union([z.string(), z.number()]).nullable(),
        })
        .passthrough(),
    ),
  })
  .passthrough()

const fullOrderWireSchema = z
  .object({
    id: z.string(),
    orderNumber: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    paymentStatus: z.string().nullable().optional(),
    placedAt: z.string().nullable().optional(),
    currencyCode: z.string(),
    grandTotal: z.union([z.string(), z.number()]).nullable().optional(),
    lines: z.array(
      z
        .object({
          id: z.string(),
          name: z.string().nullable(),
          sku: z.string().nullable().optional(),
          quantity: z.union([z.string(), z.number()]),
          unitPriceGross: z.union([z.string(), z.number()]).nullable().optional(),
          totalGross: z.union([z.string(), z.number()]).nullable().optional(),
          giftMessage: z.string().nullable().optional(),
          giftWrap: z.boolean().nullable().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough()

export type OrderSummary = {
  id: string
  orderNumber: string
  placedAt: string | null
  currency: string
  grandTotalMinor: number | null
  status?: string | null
  paymentStatus?: string | null
}

export type OrderLine = {
  id: string
  name: string
  sku: string | null
  quantity: number
  unitPriceMinor: number | null
  totalMinor: number | null
  giftMessage: string | null
  giftWrap: boolean | null
}

export type OrderDetail = {
  id: string
  orderNumber: string | null
  status: string | null
  paymentStatus: string | null
  placedAt: string | null
  currency: string
  grandTotalMinor: number | null
  lines: OrderLine[]
  /** 'full' = storefront facade; 'limited' = warranty_claims portal fallback (no prices/status). */
  detailLevel: 'full' | 'limited'
}

/** A 404 produced by the storefront module itself (route exists, order not visible). */
function isBackendNotFound(error: ApiError): boolean {
  const code = (error.details as { code?: unknown } | null | undefined)?.code
  return code === 'order_not_found' || code === 'authentication_required'
}

export const ordersApi = {
  async list(page = 1): Promise<{ items: OrderSummary[]; total: number; page: number; pageSize: number }> {
    let res: z.infer<typeof orderListWireSchema>
    try {
      res = await bffRequest('storefront/orders', orderListWireSchema, { query: { page } })
    } catch (error) {
      if (!(error instanceof ApiError && error.isMissingEndpoint && !isBackendNotFound(error))) throw error
      res = await bffRequest('warranty_claims/portal/orders', orderListWireSchema, { query: { page } })
    }
    return {
      items: res.items.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        placedAt: o.placedAt,
        currency: o.currencyCode ?? 'INR',
        grandTotalMinor: toMinorUnits(o.grandTotalGrossAmount),
        status: o.status ?? null,
        paymentStatus: o.paymentStatus ?? null,
      })),
      total: res.total,
      page: res.page,
      pageSize: res.pageSize,
    }
  },

  async get(orderId: string): Promise<OrderDetail> {
    try {
      const full = await bffRequest(`storefront/orders/${encodeURIComponent(orderId)}`, fullOrderWireSchema)
      return {
        id: full.id,
        orderNumber: full.orderNumber ?? null,
        status: full.status ?? null,
        paymentStatus: full.paymentStatus ?? null,
        placedAt: full.placedAt ?? null,
        currency: full.currencyCode,
        grandTotalMinor: toMinorUnits(full.grandTotal ?? null),
        lines: full.lines.map((l) => ({
          id: l.id,
          name: l.name ?? 'Item',
          sku: l.sku ?? null,
          quantity: Number(l.quantity) || 0,
          unitPriceMinor: toMinorUnits(l.unitPriceGross ?? null),
          totalMinor: toMinorUnits(l.totalGross ?? null),
          giftMessage: l.giftMessage ?? null,
          giftWrap: l.giftWrap ?? null,
        })),
        detailLevel: 'full',
      }
    } catch (error) {
      // The storefront module answered "not yours / not found": do not fall back.
      if (!(error instanceof ApiError && error.isMissingEndpoint) || isBackendNotFound(error)) throw error
    }
    const limited = await bffRequest('warranty_claims/portal/orders/lines', orderLinesWireSchema, { query: { orderId } })
    return {
      id: limited.order.id,
      orderNumber: null,
      status: null,
      paymentStatus: null,
      placedAt: limited.order.placedAt,
      currency: 'INR',
      grandTotalMinor: null,
      lines: limited.items.map((l) => ({
        id: l.orderLineId,
        name: l.name ?? l.sku ?? 'Item',
        sku: l.sku,
        quantity: Number(l.quantity) || 0,
        unitPriceMinor: null,
        totalMinor: null,
        giftMessage: null,
        giftWrap: null,
      })),
      detailLevel: 'limited',
    }
  },
}
