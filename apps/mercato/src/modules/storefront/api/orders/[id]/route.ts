import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { readParam, StorefrontError, storefrontHandler } from '../../../lib/http'
import { loadAccessibleOrder, resolveRequester, serializeOrderDetail } from '../../../lib/orders'
import { commonErrors, orderDetailSchema, scopeDescription, shopQueryDoc, storefrontTag } from '../../openapi'

export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 120, duration: 60, blockDuration: 60, keyPrefix: 'storefront-order' },
  },
}

/**
 * Order detail for its owner: the signed-in customer who placed it (or whose
 * CRM person it belongs to), or a guest holding the order access cookie.
 * Everything else is a 404 with code `order_not_found`.
 */
export const GET = storefrontHandler('orders.detail', async ({ req, ctx, container, shopper, translate }) => {
  const orderId = readParam(ctx, 'id')
  const notFound = new StorefrontError(404, 'order_not_found', translate('storefront.errors.orderNotFound', 'Order not found'))
  if (!orderId || !z.string().uuid().safeParse(orderId).success) throw notFound
  const em = (container.resolve('em') as EntityManager).fork()
  const requester = await resolveRequester(em, req, shopper)
  const accessible = await loadAccessibleOrder(em, shopper.scope, orderId, requester)
  if (!accessible) throw notFound
  return NextResponse.json(await serializeOrderDetail(em, shopper.scope, accessible.order, accessible.checkouts))
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront order detail',
  pathParams: z.object({ id: z.string().uuid() }),
  methods: {
    GET: {
      summary: 'Get an order of the current shopper',
      description: `${scopeDescription} Status, lines with gift options and prices, totals, addresses and the payment status mirrored from the gateway transaction.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      responses: [{ status: 200, description: 'Order detail', schema: orderDetailSchema }],
      errors: commonErrors(),
    },
  },
}
