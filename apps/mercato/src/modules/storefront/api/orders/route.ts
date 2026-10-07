import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { buildQueryParams } from '@open-mercato/shared/lib/crud/query-params'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { ordersListQuerySchema } from '../../data/validators'
import { parseOrThrow, requireCustomer, storefrontHandler } from '../../lib/http'
import { listCustomerOrders, resolveRequester } from '../../lib/orders'
import { commonErrors, orderSummarySchema, scopeDescription, shopQueryDoc, storefrontErrorSchema, storefrontTag } from '../openapi'

export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 60, duration: 60, blockDuration: 60, keyPrefix: 'storefront-orders' },
  },
}

/**
 * Order history of the signed-in customer (G5): orders they placed through
 * the storefront plus orders of their linked CRM person. Response keys are a
 * superset of `GET /api/warranty_claims/portal/orders`.
 */
export const GET = storefrontHandler('orders.list', async ({ req, container, shopper, translate }) => {
  requireCustomer(shopper, translate)
  const query = parseOrThrow(ordersListQuerySchema, buildQueryParams(new URL(req.url).searchParams), translate)
  const em = (container.resolve('em') as EntityManager).fork()
  const requester = await resolveRequester(em, req, shopper)
  const result = await listCustomerOrders(em, shopper.scope, requester, query.page, query.pageSize)
  return NextResponse.json({ ok: true, ...result })
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront order history',
  methods: {
    GET: {
      summary: 'List orders of the signed-in customer',
      description: `${scopeDescription} Requires the customer session (\`customer_auth_token\`).`,
      tags: [storefrontTag],
      query: ordersListQuerySchema.merge(shopQueryDoc),
      responses: [
        {
          status: 200,
          description: 'Paged orders, newest first',
          schema: z.object({
            ok: z.literal(true),
            items: z.array(orderSummarySchema),
            total: z.number().int(),
            page: z.number().int(),
            pageSize: z.number().int(),
          }),
        },
      ],
      errors: commonErrors([{ status: 401, description: 'Not signed in', schema: storefrontErrorSchema }]),
    },
  },
}
