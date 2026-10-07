import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { serializeAddress, type SerializedAddress } from '../../../lib/addresses'
import { StorefrontAddress } from '../../../data/entities'
import { addressCreateSchema } from '../../../data/validators'
import { STOREFRONT_ADDRESS_CREATE_COMMAND } from '../../../lib/constants'
import { parseOrThrow, readJsonBody, requireCustomer, storefrontHandler } from '../../../lib/http'
import { executeCommand, systemCommandContext } from '../../../lib/system'
import { addressSchema, commonErrors, scopeDescription, shopQueryDoc, storefrontErrorSchema, storefrontTag } from '../../openapi'

const rateLimit = { points: 60, duration: 60, blockDuration: 60, keyPrefix: 'storefront-addresses' }

export const metadata = {
  GET: { requireAuth: false, rateLimit },
  POST: { requireAuth: false, rateLimit },
}

/** Address book of the signed-in customer (G4). The owner always comes from the session. */
export const GET = storefrontHandler('addresses.list', async ({ container, shopper, translate }) => {
  const customer = requireCustomer(shopper, translate)
  const em = (container.resolve('em') as EntityManager).fork()
  const rows = await findWithDecryption(
    em,
    StorefrontAddress,
    {
      tenantId: shopper.scope.tenantId,
      organizationId: shopper.scope.organizationId,
      customerUserId: customer.sub,
      deletedAt: null,
    } as FilterQuery<StorefrontAddress>,
    { orderBy: { isDefault: 'desc', createdAt: 'asc' } } as never,
    shopper.scope,
  )
  return NextResponse.json({ items: rows.map(serializeAddress) })
})

export const POST = storefrontHandler('addresses.create', async ({ req, container, shopper, translate }) => {
  const customer = requireCustomer(shopper, translate)
  const input = parseOrThrow(addressCreateSchema, await readJsonBody(req), translate)
  const item = await executeCommand<Record<string, unknown>, SerializedAddress>(
    container,
    STOREFRONT_ADDRESS_CREATE_COMMAND,
    { ...input, tenantId: shopper.scope.tenantId, organizationId: shopper.scope.organizationId, customerUserId: customer.sub },
    systemCommandContext(container, shopper.scope, req),
  )
  return NextResponse.json({ item }, { status: 201 })
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront address book',
  methods: {
    GET: {
      summary: 'List saved addresses',
      description: `${scopeDescription} Requires the customer session.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      responses: [{ status: 200, description: 'Addresses, default first', schema: z.object({ items: z.array(addressSchema) }) }],
      errors: commonErrors([{ status: 401, description: 'Not signed in', schema: storefrontErrorSchema }]),
    },
    POST: {
      summary: 'Save an address',
      description: `${scopeDescription} Requires the customer session. The first address becomes the default.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      requestBody: { schema: addressCreateSchema },
      responses: [{ status: 201, description: 'Saved address', schema: z.object({ item: addressSchema }) }],
      errors: commonErrors([{ status: 401, description: 'Not signed in', schema: storefrontErrorSchema }]),
    },
  },
}
