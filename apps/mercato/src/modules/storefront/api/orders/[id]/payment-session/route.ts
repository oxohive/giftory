import { NextResponse } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { paymentSessionRetrySchema } from '../../../../data/validators'
import { retryOrderPayment } from '../../../../lib/checkout'
import { parseOrThrow, readJsonBody, readParam, StorefrontError, storefrontHandler } from '../../../../lib/http'
import { normalizeIdempotencyKey } from '../../../../lib/idempotency'
import { commonErrors, placedOrderSchema, scopeDescription, shopQueryDoc, storefrontErrorSchema, storefrontTag } from '../../../openapi'

export const metadata = {
  POST: {
    requireAuth: false,
    rateLimit: { points: 10, duration: 60, blockDuration: 120, keyPrefix: 'storefront-order-payment' },
  },
}

/** Open a new payment session for an unpaid order instead of placing a duplicate order. */
export const POST = storefrontHandler('orders.payment-session', async ({ req, ctx, container, shopper, translate }) => {
  const orderId = readParam(ctx, 'id')
  if (!orderId || !z.string().uuid().safeParse(orderId).success) {
    throw new StorefrontError(404, 'order_not_found', translate('storefront.errors.orderNotFound', 'Order not found'))
  }
  const idempotencyKey = normalizeIdempotencyKey(req.headers.get('idempotency-key'))
  if (!idempotencyKey) {
    throw new StorefrontError(
      400,
      'idempotency_key_required',
      translate('storefront.errors.idempotencyKeyRequired', 'An Idempotency-Key header (16-128 characters) is required'),
    )
  }
  const input = parseOrThrow(paymentSessionRetrySchema, await readJsonBody(req), translate)
  const result = await retryOrderPayment({ req, container, shopper, orderId, input, idempotencyKey, translate })
  return NextResponse.json(result.body, { status: result.status })
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront payment retry',
  pathParams: z.object({ id: z.string().uuid() }),
  methods: {
    POST: {
      summary: 'Open a new payment session for an unpaid order',
      description: `${scopeDescription} Same access rules as the order detail. Requires an \`Idempotency-Key\` header.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      headers: z.object({ 'Idempotency-Key': z.string().min(16).max(128) }),
      requestBody: { schema: paymentSessionRetrySchema },
      responses: [
        { status: 201, description: 'Payment session opened', schema: placedOrderSchema },
        { status: 200, description: 'Idempotent replay', schema: placedOrderSchema },
      ],
      errors: commonErrors([
        { status: 409, description: 'Order already paid, or idempotency conflict', schema: storefrontErrorSchema },
        { status: 502, description: 'Payment provider unavailable', schema: storefrontErrorSchema },
      ]),
    },
  },
}
