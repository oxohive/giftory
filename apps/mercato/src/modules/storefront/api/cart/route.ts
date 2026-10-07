import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { cartReplaceSchema } from '../../data/validators'
import { buildCartView, clearCart, readCartOwner, replaceCartLines, resolveCart } from '../../lib/cart'
import { applyCookies, parseOrThrow, readJsonBody, storefrontHandler } from '../../lib/http'
import { cartViewSchema, commonErrors, scopeDescription, shopQueryDoc, storefrontTag } from '../openapi'

/**
 * Server-side cart (G2), keyed by the `sf_cart_token` cookie (anonymous) or
 * the signed-in customer. Every response re-prices the lines from the catalog.
 */
const rateLimit = { points: 120, duration: 60, blockDuration: 60, keyPrefix: 'storefront-cart' }

export const metadata = {
  GET: { requireAuth: false, rateLimit },
  PUT: { requireAuth: false, rateLimit },
  DELETE: { requireAuth: false, rateLimit },
}

export const GET = storefrontHandler('cart.get', async ({ req, container, shopper }) => {
  const em = (container.resolve('em') as EntityManager).fork()
  const session = await resolveCart(em, shopper.scope, readCartOwner(req, shopper.customer), false)
  const cart = await buildCartView(em, shopper.scope, session.cart)
  return applyCookies(NextResponse.json({ cart }), session.cookies)
})

export const PUT = storefrontHandler('cart.replace', async ({ req, container, shopper, translate }) => {
  const input = parseOrThrow(cartReplaceSchema, await readJsonBody(req), translate)
  const em = (container.resolve('em') as EntityManager).fork()
  const session = await resolveCart(em, shopper.scope, readCartOwner(req, shopper.customer), true)
  await replaceCartLines(em, shopper.scope, session.cart!, input.lines, translate)
  const cart = await buildCartView(em, shopper.scope, session.cart)
  return applyCookies(NextResponse.json({ cart }), session.cookies)
})

export const DELETE = storefrontHandler('cart.clear', async ({ req, container, shopper }) => {
  const em = (container.resolve('em') as EntityManager).fork()
  const session = await resolveCart(em, shopper.scope, readCartOwner(req, shopper.customer), false)
  if (session.cart) await clearCart(em, shopper.scope, session.cart)
  const cart = await buildCartView(em, shopper.scope, session.cart)
  return applyCookies(NextResponse.json({ cart }), session.cookies)
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront cart',
  methods: {
    GET: {
      summary: 'Get the current cart (re-priced)',
      description: `${scopeDescription} Anonymous carts are identified by the httpOnly \`sf_cart_token\` cookie; an anonymous cart presented by a signed-in customer is merged into their account cart.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      responses: [{ status: 200, description: 'Cart with server prices; lines that can no longer be bought carry an `issue` code', schema: cartViewSchema }],
      errors: commonErrors(),
    },
    PUT: {
      summary: 'Replace all cart lines',
      description: `${scopeDescription} Used to sync a device-local cart. Client prices are never accepted.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      requestBody: { schema: cartReplaceSchema },
      responses: [{ status: 200, description: 'Updated cart', schema: cartViewSchema }],
      errors: commonErrors(),
    },
    DELETE: {
      summary: 'Empty the cart',
      description: scopeDescription,
      tags: [storefrontTag],
      query: shopQueryDoc,
      responses: [{ status: 200, description: 'Empty cart', schema: cartViewSchema }],
      errors: commonErrors(),
    },
  },
}
