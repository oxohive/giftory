import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { cartLineUpdateSchema } from '../../../../data/validators'
import { buildCartView, readCartOwner, removeCartLine, resolveCart, updateCartLine } from '../../../../lib/cart'
import {
  applyCookies,
  parseOrThrow,
  readJsonBody,
  readParam,
  StorefrontError,
  storefrontHandler,
  type RouteContext,
  type Translate,
} from '../../../../lib/http'
import { cartViewSchema, commonErrors, scopeDescription, shopQueryDoc, storefrontTag } from '../../../openapi'

const rateLimit = { points: 60, duration: 60, blockDuration: 60, keyPrefix: 'storefront-cart-line' }

export const metadata = {
  PUT: { requireAuth: false, rateLimit },
  DELETE: { requireAuth: false, rateLimit },
}

function lineNotFound(translate: Translate) {
  return new StorefrontError(404, 'not_found', translate('storefront.errors.cartLineNotFound', 'Cart item not found'))
}

function lineIdOf(ctx: RouteContext | undefined, translate: Translate): string {
  const id = readParam(ctx, 'lineId')
  if (!id || !z.string().uuid().safeParse(id).success) throw lineNotFound(translate)
  return id
}

export const PUT = storefrontHandler('cart.lines.update', async ({ req, ctx, container, shopper, translate }) => {
  const lineId = lineIdOf(ctx, translate)
  const patch = parseOrThrow(cartLineUpdateSchema, await readJsonBody(req), translate)
  const em = (container.resolve('em') as EntityManager).fork()
  const session = await resolveCart(em, shopper.scope, readCartOwner(req, shopper.customer), false)
  if (!session.cart) throw lineNotFound(translate)
  await updateCartLine(em, shopper.scope, session.cart, lineId, patch, translate)
  const cart = await buildCartView(em, shopper.scope, session.cart)
  return applyCookies(NextResponse.json({ cart }), session.cookies)
})

export const DELETE = storefrontHandler('cart.lines.remove', async ({ req, ctx, container, shopper, translate }) => {
  const lineId = lineIdOf(ctx, translate)
  const em = (container.resolve('em') as EntityManager).fork()
  const session = await resolveCart(em, shopper.scope, readCartOwner(req, shopper.customer), false)
  if (!session.cart) throw lineNotFound(translate)
  await removeCartLine(em, shopper.scope, session.cart, lineId, translate)
  const cart = await buildCartView(em, shopper.scope, session.cart)
  return applyCookies(NextResponse.json({ cart }), session.cookies)
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront cart line',
  pathParams: z.object({ lineId: z.string().uuid() }),
  methods: {
    PUT: {
      summary: 'Change quantity or gift options of a cart line',
      description: `${scopeDescription} A line whose gift options become identical to another line is merged into it.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      requestBody: { schema: cartLineUpdateSchema },
      responses: [{ status: 200, description: 'Updated cart', schema: cartViewSchema }],
      errors: commonErrors(),
    },
    DELETE: {
      summary: 'Remove a cart line',
      description: scopeDescription,
      tags: [storefrontTag],
      query: shopQueryDoc,
      responses: [{ status: 200, description: 'Updated cart', schema: cartViewSchema }],
      errors: commonErrors(),
    },
  },
}
