import { NextResponse } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import type { SerializedAddress } from '../../../../lib/addresses'
import { addressUpdateSchema } from '../../../../data/validators'
import { STOREFRONT_ADDRESS_DELETE_COMMAND, STOREFRONT_ADDRESS_UPDATE_COMMAND } from '../../../../lib/constants'
import {
  parseOrThrow,
  readJsonBody,
  readParam,
  requireCustomer,
  StorefrontError,
  storefrontHandler,
  type RouteContext,
  type Translate,
} from '../../../../lib/http'
import { executeCommand, systemCommandContext } from '../../../../lib/system'
import { addressSchema, commonErrors, scopeDescription, shopQueryDoc, storefrontErrorSchema, storefrontTag } from '../../../openapi'

const rateLimit = { points: 60, duration: 60, blockDuration: 60, keyPrefix: 'storefront-address' }

export const metadata = {
  PUT: { requireAuth: false, rateLimit },
  DELETE: { requireAuth: false, rateLimit },
}

function addressIdOf(ctx: RouteContext | undefined, translate: Translate): string {
  const id = readParam(ctx, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw new StorefrontError(404, 'not_found', translate('storefront.errors.addressNotFound', 'Address not found'))
  }
  return id
}

export const PUT = storefrontHandler('addresses.update', async ({ req, ctx, container, shopper, translate }) => {
  const customer = requireCustomer(shopper, translate)
  const id = addressIdOf(ctx, translate)
  const input = parseOrThrow(addressUpdateSchema, await readJsonBody(req), translate)
  const item = await executeCommand<Record<string, unknown>, SerializedAddress>(
    container,
    STOREFRONT_ADDRESS_UPDATE_COMMAND,
    { ...input, id, tenantId: shopper.scope.tenantId, organizationId: shopper.scope.organizationId, customerUserId: customer.sub },
    systemCommandContext(container, shopper.scope, req),
  )
  return NextResponse.json({ item })
})

export const DELETE = storefrontHandler('addresses.delete', async ({ req, ctx, container, shopper, translate }) => {
  const customer = requireCustomer(shopper, translate)
  const id = addressIdOf(ctx, translate)
  await executeCommand(
    container,
    STOREFRONT_ADDRESS_DELETE_COMMAND,
    { id, tenantId: shopper.scope.tenantId, organizationId: shopper.scope.organizationId, customerUserId: customer.sub },
    systemCommandContext(container, shopper.scope, req),
  )
  return NextResponse.json({ ok: true })
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront address',
  pathParams: z.object({ id: z.string().uuid() }),
  methods: {
    PUT: {
      summary: 'Update a saved address',
      description: `${scopeDescription} Requires the customer session; only the owner can change it.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      requestBody: { schema: addressUpdateSchema },
      responses: [{ status: 200, description: 'Updated address', schema: z.object({ item: addressSchema }) }],
      errors: commonErrors([{ status: 401, description: 'Not signed in', schema: storefrontErrorSchema }]),
    },
    DELETE: {
      summary: 'Delete a saved address',
      description: `${scopeDescription} Requires the customer session; only the owner can delete it.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      responses: [{ status: 200, description: 'Deleted', schema: z.object({ ok: z.literal(true) }) }],
      errors: commonErrors([{ status: 401, description: 'Not signed in', schema: storefrontErrorSchema }]),
    },
  },
}
