import { NextResponse } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { placeOrderSchema } from '../../../data/validators'
import { placeOrder } from '../../../lib/checkout'
import { applyCookies, parseOrThrow, readJsonBody, StorefrontError, storefrontHandler } from '../../../lib/http'
import { normalizeIdempotencyKey } from '../../../lib/idempotency'
import { commonErrors, placedOrderSchema, scopeDescription, shopQueryDoc, storefrontErrorSchema, storefrontTag } from '../../openapi'

export const metadata = {
  POST: {
    requireAuth: false,
    rateLimit: { points: 10, duration: 60, blockDuration: 120, keyPrefix: 'storefront-checkout-orders' },
  },
}

/**
 * Place an order (G3): re-price lines from the catalog, create the native
 * sales order (`sales.orders.create` with lines, address snapshots and the
 * shipping adjustment), link the CRM customer, then open a payment session
 * through `paymentGatewayService.createPaymentSession`.
 */
export const POST = storefrontHandler('checkout.orders', async ({ req, container, shopper, translate }) => {
  const idempotencyKey = normalizeIdempotencyKey(req.headers.get('idempotency-key'))
  if (!idempotencyKey) {
    throw new StorefrontError(
      400,
      'idempotency_key_required',
      translate('storefront.errors.idempotencyKeyRequired', 'An Idempotency-Key header (16-128 characters) is required'),
    )
  }
  const input = parseOrThrow(placeOrderSchema, await readJsonBody(req), translate)
  const result = await placeOrder({ req, container, shopper, input, idempotencyKey, translate })
  return applyCookies(NextResponse.json(result.body, { status: result.status }), result.cookies)
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront order placement',
  methods: {
    POST: {
      summary: 'Place an order and open a payment session',
      description: `${scopeDescription} Requires an \`Idempotency-Key\` header: a retry with the same key and body returns the same order and payment session (200); a different body under the same key is rejected (409). Prices and totals are computed on the server. \`{orderId}\` in \`successUrl\` is substituted. Guests receive an httpOnly \`sf_order_access\` cookie that lets them read the order.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      headers: z.object({ 'Idempotency-Key': z.string().min(16).max(128) }),
      requestBody: { schema: placeOrderSchema },
      responses: [
        { status: 201, description: 'Order created and payment session opened', schema: placedOrderSchema },
        { status: 200, description: 'Idempotent replay of an earlier request', schema: placedOrderSchema },
      ],
      errors: commonErrors([
        { status: 409, description: 'Idempotency key reused with another body, request still in progress, or order already paid', schema: storefrontErrorSchema },
        { status: 502, description: 'Payment provider unavailable; the order exists (`orderId` in the body) and the request can be retried', schema: storefrontErrorSchema },
      ]),
    },
  },
}
