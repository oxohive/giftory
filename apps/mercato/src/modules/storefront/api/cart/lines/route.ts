import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { cartLineInputSchema } from '../../../data/validators'
import { addCartLine, buildCartView, readCartOwner, resolveCart } from '../../../lib/cart'
import { applyCookies, parseOrThrow, readJsonBody, storefrontHandler } from '../../../lib/http'
import { cartViewSchema, commonErrors, scopeDescription, shopQueryDoc, storefrontTag } from '../../openapi'

export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 60, duration: 60, blockDuration: 60, keyPrefix: 'storefront-cart-lines' } },
}

export const POST = storefrontHandler('cart.lines.add', async ({ req, container, shopper, translate }) => {
  const input = parseOrThrow(cartLineInputSchema, await readJsonBody(req), translate)
  const em = (container.resolve('em') as EntityManager).fork()
  const session = await resolveCart(em, shopper.scope, readCartOwner(req, shopper.customer), true)
  await addCartLine(em, shopper.scope, session.cart!, input, translate)
  const cart = await buildCartView(em, shopper.scope, session.cart)
  return applyCookies(NextResponse.json({ cart }, { status: 201 }), session.cookies)
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront cart lines',
  methods: {
    POST: {
      summary: 'Add a variant to the cart',
      description: `${scopeDescription} Same product + variant + gift options merge into one line. Gift wrap and message are validated against the gift profile of the product (\`giftWrapAvailable\`, \`giftMessageMaxLength\`).`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      requestBody: { schema: cartLineInputSchema },
      responses: [{ status: 201, description: 'Updated cart', schema: cartViewSchema }],
      errors: commonErrors(),
    },
  },
}
