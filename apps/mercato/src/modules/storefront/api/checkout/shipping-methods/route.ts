import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { buildQueryParams } from '@open-mercato/shared/lib/crud/query-params'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { shippingMethodsQuerySchema } from '../../../data/validators'
import { cartLineInputs, readCartOwner, resolveCart } from '../../../lib/cart'
import { repriceLines } from '../../../lib/catalog'
import { STOREFRONT_CURRENCY } from '../../../lib/constants'
import { applyCookies, parseOrThrow, storefrontHandler } from '../../../lib/http'
import { round2 } from '../../../lib/pricing'
import { listShippingMethods, quoteShipping, type ShippingQuoteLine } from '../../../lib/shipping'
import { commonErrors, scopeDescription, shopQueryDoc, storefrontTag } from '../../openapi'

export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 60, duration: 60, blockDuration: 60, keyPrefix: 'storefront-shipping-methods' },
  },
}

/**
 * Delivery options from the native `sales_shipping_methods`, priced by the
 * native sales calculator. The shopper's server cart is used when it has
 * lines; otherwise the `subtotal` / `itemCount` query describes the basket.
 */
export const GET = storefrontHandler('checkout.shipping-methods', async ({ req, container, shopper, translate }) => {
  const query = parseOrThrow(shippingMethodsQuerySchema, buildQueryParams(new URL(req.url).searchParams), translate)
  const em = (container.resolve('em') as EntityManager).fork()
  const scope = shopper.scope

  let lines: ShippingQuoteLine[] = []
  const session = await resolveCart(em, scope, readCartOwner(req, shopper.customer), false)
  if (session.cart) {
    const priced = await repriceLines(em, scope, await cartLineInputs(em, scope, session.cart))
    lines = priced.lines.map((line) => ({
      productId: line.productId,
      productVariantId: line.variantId,
      quantity: line.quantity,
      unitPriceNet: line.amounts.unitNet,
      unitPriceGross: line.amounts.unitGross,
      taxRate: line.amounts.taxRate,
      taxAmount: line.amounts.taxAmount,
      totalGrossAmount: line.amounts.totalGross,
    }))
  }
  if (!lines.length) {
    const subtotal = round2(query.subtotal ?? 0)
    const quantity = query.itemCount ?? 1
    lines = [
      {
        productId: null,
        productVariantId: null,
        quantity,
        unitPriceNet: round2(subtotal / quantity),
        unitPriceGross: round2(subtotal / quantity),
        taxRate: 0,
        taxAmount: 0,
        totalGrossAmount: subtotal,
      },
    ]
  }

  const methods = await listShippingMethods(em, scope)
  const items = []
  for (const method of methods) {
    items.push({
      id: method.id,
      code: method.code,
      name: method.name,
      description: method.description,
      amount: await quoteShipping(container, scope, method, lines),
      currencyCode: STOREFRONT_CURRENCY,
      estimatedTransitDays: method.estimatedTransitDays,
      carrierCode: method.carrierCode,
    })
  }
  return applyCookies(NextResponse.json({ items }), session.cookies)
})

const methodSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  amount: z.number().describe('Decimal major units (INR, gross)'),
  currencyCode: z.string(),
  estimatedTransitDays: z.number().int().nullable(),
  carrierCode: z.string().nullable(),
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront delivery options',
  methods: {
    GET: {
      summary: 'List delivery options with prices',
      description: `${scopeDescription} Prices come from the native sales shipping methods and calculator, so they match what order placement charges.`,
      tags: [storefrontTag],
      query: shippingMethodsQuerySchema.merge(shopQueryDoc),
      responses: [{ status: 200, description: 'Active INR shipping methods', schema: z.object({ items: z.array(methodSchema) }) }],
      errors: commonErrors(),
    },
  },
}
