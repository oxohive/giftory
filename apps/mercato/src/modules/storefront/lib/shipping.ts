import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { SalesShippingMethod } from '@open-mercato/core/modules/sales/data/entities'
import { getShippingProvider } from '@open-mercato/core/modules/sales/lib/providers/registry'
import type { SalesAdjustmentDraft, SalesLineSnapshot } from '@open-mercato/core/modules/sales/lib/types'
import type { SalesCalculationService } from '@open-mercato/core/modules/sales/services/salesCalculationService'
import { STOREFRONT_CURRENCY } from './constants'
import { round2, toNumberOrNull } from './pricing'
import type { StorefrontScope } from './scope'

/**
 * Shipping options come from the native `sales_shipping_methods`. Prices are
 * computed with the native `salesCalculationService`, so a method with a
 * registered shipping provider (e.g. `flat-rate` tiers) quotes exactly what
 * `sales.orders.create` will charge. A method without a provider charges its
 * base rate, which the order receives as an explicit `shipping` adjustment.
 *
 * Live carrier rates (`shipping_carriers`) need parcel dimensions and an origin
 * address the storefront does not have yet; see the module report.
 */

export type ShippingMethodView = {
  id: string
  code: string
  name: string
  description: string | null
  amount: number
  currencyCode: string
  estimatedTransitDays: number | null
  carrierCode: string | null
}

export type ShippingMethodRecord = {
  id: string
  code: string
  name: string
  description: string | null
  providerKey: string | null
  carrierCode: string | null
  serviceLevel: string | null
  estimatedTransitDays: number | null
  baseRateNet: number
  baseRateGross: number
  currencyCode: string | null
  metadata: Record<string, unknown> | null
}

export async function listShippingMethods(em: EntityManager, scope: StorefrontScope): Promise<ShippingMethodRecord[]> {
  const rows = await em.find(
    SalesShippingMethod,
    {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
      isActive: true,
      $or: [{ currencyCode: null }, { currencyCode: STOREFRONT_CURRENCY }],
    } as FilterQuery<SalesShippingMethod>,
    { orderBy: { baseRateGross: 'asc', name: 'asc' } as never },
  )
  return rows.map((row) => ({
    id: String(row.id),
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    providerKey: row.providerKey ?? null,
    carrierCode: row.carrierCode ?? null,
    serviceLevel: row.serviceLevel ?? null,
    estimatedTransitDays: row.estimatedTransitDays ?? null,
    baseRateNet: toNumberOrNull(row.baseRateNet) ?? 0,
    baseRateGross: toNumberOrNull(row.baseRateGross) ?? toNumberOrNull(row.baseRateNet) ?? 0,
    currencyCode: row.currencyCode ?? null,
    metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? null,
  }))
}

export function methodUsesProvider(method: Pick<ShippingMethodRecord, 'providerKey'>): boolean {
  if (!method.providerKey) return false
  const provider = getShippingProvider(method.providerKey)
  return typeof provider?.calculate === 'function'
}

/** Manual shipping adjustment for provider-less methods (base rate). */
export function manualShippingAdjustment(method: ShippingMethodRecord): SalesAdjustmentDraft | null {
  if (methodUsesProvider(method)) return null
  const gross = round2(Math.max(0, method.baseRateGross))
  const net = round2(Math.min(Math.max(0, method.baseRateNet || gross), gross))
  if (gross <= 0) return null
  return {
    scope: 'order',
    kind: 'shipping',
    code: method.code,
    label: method.name,
    amountNet: net,
    amountGross: gross,
    currencyCode: STOREFRONT_CURRENCY,
    metadata: { source: 'storefront', shippingMethodId: method.id },
    position: 0,
  }
}

/** Mirrors `sales` `normalizeShippingMethodContext` so providers see the same input. */
export function shippingMethodContext(method: ShippingMethodRecord) {
  const providerSettings =
    method.metadata && typeof method.metadata.providerSettings === 'object' ? (method.metadata.providerSettings as Record<string, unknown>) : null
  return {
    id: method.id,
    code: method.code,
    name: method.name,
    providerKey: method.providerKey,
    currencyCode: method.currencyCode ?? STOREFRONT_CURRENCY,
    baseRateNet: method.baseRateNet,
    baseRateGross: method.baseRateGross,
    metadata: method.metadata,
    providerSettings,
  }
}

export type ShippingQuoteLine = Pick<SalesLineSnapshot, 'productId' | 'productVariantId' | 'quantity' | 'unitPriceNet' | 'unitPriceGross' | 'taxRate'> & {
  totalGrossAmount: number
  taxAmount: number
}

/** Shipping charge for a method and a set of priced lines, via the native calculator. */
export async function quoteShipping(
  container: AppContainer,
  scope: StorefrontScope,
  method: ShippingMethodRecord,
  lines: ShippingQuoteLine[],
): Promise<number> {
  const manual = manualShippingAdjustment(method)
  if (!methodUsesProvider(method)) return manual ? Number(manual.amountGross ?? 0) : 0
  const calculator = container.resolve('salesCalculationService') as SalesCalculationService
  const snapshots: SalesLineSnapshot[] = lines.map((line) => ({
    kind: 'product',
    productId: line.productId ?? null,
    productVariantId: line.productVariantId ?? null,
    quantity: line.quantity,
    currencyCode: STOREFRONT_CURRENCY,
    unitPriceNet: line.unitPriceNet ?? null,
    unitPriceGross: line.unitPriceGross ?? null,
    taxRate: line.taxRate ?? null,
    // Gross and tax are asserted (2-decimal, what the shopper pays); net is left
    // to the engine to avoid 4-vs-2 decimal reconciliation warnings.
    taxAmount: line.taxAmount,
    totalGrossAmount: line.totalGrossAmount,
  }))
  const result = await calculator.calculateDocumentTotals({
    documentKind: 'order',
    lines: snapshots,
    adjustments: [],
    context: {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      currencyCode: STOREFRONT_CURRENCY,
      metadata: { shippingMethod: shippingMethodContext(method), paymentMethod: null },
    },
  })
  return round2(Number(result.totals.shippingGrossAmount ?? 0))
}
