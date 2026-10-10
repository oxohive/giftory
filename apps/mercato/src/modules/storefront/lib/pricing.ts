/**
 * Pure storefront pricing. Every amount the storefront shows or charges is
 * computed here from catalog price rows; client-sent prices are never read.
 *
 * Money convention:
 *  - All arithmetic runs in integer minor units (paise) via toMinor/fromMinor.
 *  - App-owned DB columns (storefront_checkouts) store integer paise (numeric(18,0)).
 *  - Open Mercato commands/APIs receive decimal major units (their contract).
 *  - Values returned from this module are decimal major units rounded to 2dp.
 *
 * Never use raw JS arithmetic on monetary values; go through toMinor/fromMinor
 * so floating-point drift is confined to sub-paise and then rounded away.
 */

export type StorefrontPriceRow = {
  id: string
  productId: string | null
  variantId: string | null
  offerId: string | null
  currencyCode: string
  kindCode: string
  minQuantity: number | null
  maxQuantity: number | null
  unitPriceNet: number | null
  unitPriceGross: number | null
  taxRate: number | null
  channelId: string | null
  customerId: string | null
  customerGroupId: string | null
  userId: string | null
  userGroupId: string | null
  startsAt: Date | null
  endsAt: Date | null
}

export type PriceSelectionContext = {
  currencyCode: string
  priceKindCode: string
  quantity: number
  now: Date
}

export type UnitPrice = {
  priceId: string
  unitNet: number
  unitGross: number
  taxRate: number
}

export type PricedAmounts = UnitPrice & {
  quantity: number
  totalNet: number
  totalGross: number
  taxAmount: number
}

export type OrderTotals = {
  subtotal: number
  shipping: number
  tax: number
  grandTotal: number
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function toMinor(major: number): number {
  return Math.round((major + Number.EPSILON) * 100)
}

export function fromMinor(minor: number): number {
  return Math.round(minor) / 100
}

export function round2(value: number): number {
  return fromMinor(toMinor(value))
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000
}

/**
 * Public list prices only: the configured currency and price kind, no
 * customer/user/group/channel/offer targeting, inside the validity window.
 */
export function isPublicStorefrontPrice(row: StorefrontPriceRow, ctx: Omit<PriceSelectionContext, 'quantity'>): boolean {
  if (row.currencyCode.toUpperCase() !== ctx.currencyCode.toUpperCase()) return false
  if (row.kindCode !== ctx.priceKindCode) return false
  if (row.channelId || row.offerId) return false
  if (row.customerId || row.customerGroupId || row.userId || row.userGroupId) return false
  if (row.startsAt && row.startsAt.getTime() > ctx.now.getTime()) return false
  if (row.endsAt && row.endsAt.getTime() < ctx.now.getTime()) return false
  if (row.unitPriceGross === null && row.unitPriceNet === null) return false
  return true
}

/**
 * Pick the price for one product/variant at a quantity. A variant-specific row
 * beats a product-level row; among equals the highest applicable quantity tier
 * wins, then the most recent `startsAt`, then the row id (deterministic).
 */
export function selectStorefrontPrice(
  rows: StorefrontPriceRow[],
  target: { productId: string; variantId: string | null },
  ctx: PriceSelectionContext,
): StorefrontPriceRow | null {
  const candidates = rows.filter((row) => {
    if (!isPublicStorefrontPrice(row, ctx)) return false
    const variantMatches = row.variantId === null ? row.productId === target.productId : row.variantId === target.variantId
    if (!variantMatches) return false
    const min = row.minQuantity ?? 1
    if (ctx.quantity < min) return false
    if (row.maxQuantity !== null && row.maxQuantity !== undefined && ctx.quantity > row.maxQuantity) return false
    return true
  })
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const variantDiff = Number(b.variantId !== null) - Number(a.variantId !== null)
    if (variantDiff !== 0) return variantDiff
    const tierDiff = (b.minQuantity ?? 1) - (a.minQuantity ?? 1)
    if (tierDiff !== 0) return tierDiff
    const startDiff = (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0)
    if (startDiff !== 0) return startDiff
    return a.id.localeCompare(b.id)
  })
  return candidates[0] ?? null
}

/**
 * Normalize a price row to unit net/gross. Gross is the shopper-facing amount
 * (INR list prices are tax-inclusive) and is rounded to paise; net is derived
 * from the tax rate when the row only carries one side.
 */
export function resolveUnitPrice(row: StorefrontPriceRow, fallbackTaxRate: number | null = null): UnitPrice | null {
  const taxRate = Math.max(0, row.taxRate ?? fallbackTaxRate ?? 0)
  const factor = 1 + taxRate / 100
  let unitGross: number
  let unitNet: number
  if (row.unitPriceGross !== null) {
    unitGross = round2(row.unitPriceGross)
    unitNet = row.unitPriceNet !== null ? round4(row.unitPriceNet) : round4(unitGross / factor)
  } else if (row.unitPriceNet !== null) {
    unitNet = round4(row.unitPriceNet)
    unitGross = round2(row.unitPriceNet * factor)
  } else {
    return null
  }
  if (unitGross < 0 || unitNet < 0) return null
  return { priceId: row.id, unitNet, unitGross, taxRate }
}

/** Line totals in 2-decimal major units; tax is the gross/net difference, never negative. */
export function priceLine(unit: UnitPrice, quantity: number): PricedAmounts {
  const totalGrossMinor = toMinor(unit.unitGross) * quantity
  const totalNetMinor = Math.min(Math.round(unit.unitNet * 100 * quantity), totalGrossMinor)
  return {
    ...unit,
    quantity,
    totalGross: fromMinor(totalGrossMinor),
    totalNet: fromMinor(totalNetMinor),
    taxAmount: fromMinor(Math.max(0, totalGrossMinor - totalNetMinor)),
  }
}

export function summarizeTotals(lines: Array<Pick<PricedAmounts, 'totalGross' | 'taxAmount'>>, shippingGross: number): OrderTotals {
  const subtotalMinor = lines.reduce((sum, line) => sum + toMinor(line.totalGross), 0)
  const taxMinor = lines.reduce((sum, line) => sum + toMinor(line.taxAmount), 0)
  const shippingMinor = toMinor(Math.max(0, shippingGross))
  return {
    subtotal: fromMinor(subtotalMinor),
    shipping: fromMinor(shippingMinor),
    tax: fromMinor(taxMinor),
    grandTotal: fromMinor(subtotalMinor + shippingMinor),
  }
}

/**
 * "From" price of a product for listings: the cheapest of its product-level
 * price and the prices of its active variants (quantity 1).
 */
export function lowestUnitPrice(
  rows: StorefrontPriceRow[],
  productId: string,
  variantIds: string[],
  ctx: Omit<PriceSelectionContext, 'quantity'>,
  fallbackTaxRate: number | null = null,
): UnitPrice | null {
  const selectionCtx = { ...ctx, quantity: 1 }
  const targets: Array<{ productId: string; variantId: string | null }> = variantIds.length
    ? variantIds.map((variantId) => ({ productId, variantId }))
    : [{ productId, variantId: null }]
  let best: UnitPrice | null = null
  for (const target of targets) {
    const row = selectStorefrontPrice(rows, target, selectionCtx)
    const unit = row ? resolveUnitPrice(row, fallbackTaxRate) : null
    if (unit && (!best || unit.unitGross < best.unitGross)) best = unit
  }
  return best
}

export type QuantityRules = { minOrderQty: number | null; maxOrderQty: number | null; orderQtyIncrement: number | null }

export type QuantityIssue = 'quantity_below_minimum' | 'quantity_above_maximum' | 'quantity_increment'

export function checkQuantity(quantity: number, rules: QuantityRules, hardMax: number): QuantityIssue | null {
  const min = Math.max(1, rules.minOrderQty ?? 1)
  if (quantity < min) return 'quantity_below_minimum'
  const max = rules.maxOrderQty && rules.maxOrderQty > 0 ? Math.min(rules.maxOrderQty, hardMax) : hardMax
  if (quantity > max) return 'quantity_above_maximum'
  const step = rules.orderQtyIncrement && rules.orderQtyIncrement > 1 ? rules.orderQtyIncrement : null
  if (step && (quantity - min) % step !== 0) return 'quantity_increment'
  return null
}
