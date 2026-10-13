import type { EntityManager } from '@mikro-orm/postgresql'

/**
 * Reads exactly the order fields FEAT-010's dealer order-detail screen is
 * allowed to show: product, variant, quantity, gift message, production
 * requirements/deadline, and city+pincode only — never customer PII (name,
 * phone, full address, email), payment amounts, or other dealers' data.
 *
 * Deliberately uses raw SQL against the `sales` module's own tables instead
 * of importing `SalesOrder`/`SalesOrderLine` entities — this mirrors the
 * existing `assertOrderIsPaid` precedent in `commands/assignments.ts`, which
 * avoids a cross-module ORM coupling the same way. Only the columns needed
 * for this safe projection are selected; nothing else from the order is ever
 * read into memory.
 */

export type DealerOrderLineDetail = {
  id: string
  productId: string | null
  variantId: string | null
  name: string | null
  quantity: number
  giftMessage: string | null
  /**
   * Production/design requirements for this line — e.g. engraving text,
   * print placement, size/color selections captured at checkout. Sourced
   * from `sales_order_lines.configuration` (the catalog customization
   * payload) merged with any free-text `comment` left on the line. Passed
   * through as an opaque record; the dealer portal renders it, it does not
   * interpret it.
   */
  productionRequirements: Record<string, unknown> | null
}

export type DealerOrderShippingDetail = {
  city: string | null
  pincode: string | null
}

export type DealerOrderDetail = {
  orderNumber: string | null
  lines: DealerOrderLineDetail[]
  shipping: DealerOrderShippingDetail
}

function readGiftMessage(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const record = metadata as Record<string, unknown>
  const gift = record.gift && typeof record.gift === 'object' ? (record.gift as Record<string, unknown>) : record
  return typeof gift.giftMessage === 'string' && gift.giftMessage.length > 0 ? gift.giftMessage : null
}

function readShippingAddress(snapshot: unknown): DealerOrderShippingDetail {
  if (!snapshot || typeof snapshot !== 'object') return { city: null, pincode: null }
  const record = snapshot as Record<string, unknown>
  const city = typeof record.city === 'string' ? record.city : null
  const pincode = typeof record.postalCode === 'string' ? record.postalCode : null
  return { city, pincode }
}

function buildProductionRequirements(
  configuration: unknown,
  comment: unknown,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  if (configuration && typeof configuration === 'object') {
    Object.assign(out, configuration as Record<string, unknown>)
  }
  if (typeof comment === 'string' && comment.trim().length > 0) {
    out.note = comment.trim()
  }
  return Object.keys(out).length > 0 ? out : null
}

export async function loadDealerOrderDetail(
  em: EntityManager,
  orderId: string,
  tenantId: string,
): Promise<DealerOrderDetail> {
  const orderRows = await em.getConnection().execute(
    `SELECT order_number, shipping_address_snapshot FROM sales_orders WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [orderId, tenantId],
  )
  const orderRow = orderRows[0] as { order_number?: string; shipping_address_snapshot?: unknown } | undefined

  const lineRows = await em.getConnection().execute(
    `SELECT id, product_id, product_variant_id, name, quantity, metadata, configuration, comment
     FROM sales_order_lines
     WHERE order_id = ? AND tenant_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind IN ('product', 'service'))
     ORDER BY line_number ASC`,
    [orderId, tenantId],
  )

  const lines: DealerOrderLineDetail[] = (lineRows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    productId: row.product_id ? String(row.product_id) : null,
    variantId: row.product_variant_id ? String(row.product_variant_id) : null,
    name: typeof row.name === 'string' ? row.name : null,
    quantity: Number(row.quantity ?? 0),
    giftMessage: readGiftMessage(row.metadata),
    productionRequirements: buildProductionRequirements(row.configuration, row.comment),
  }))

  return {
    orderNumber: orderRow?.order_number ?? null,
    lines,
    shipping: readShippingAddress(orderRow?.shipping_address_snapshot),
  }
}
