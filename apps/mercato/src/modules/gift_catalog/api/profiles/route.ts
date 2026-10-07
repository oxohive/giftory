import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { parseIdsParam } from '@open-mercato/shared/lib/crud/ids'
import type { Where, WhereValue } from '@open-mercato/shared/lib/query/types'
import { GiftProductProfile } from '../../data/entities'
import {
  deleteByIdSchema,
  giftProductProfileCreateSchema,
  giftProductProfileListSchema,
  giftProductProfileUpdateSchema,
  type GiftProductProfileListQuery,
} from '../../data/validators'
import {
  GIFT_PRODUCT_PROFILE_ENTITY_ID,
  GIFT_PROFILE_CREATE_COMMAND,
  GIFT_PROFILE_DELETE_COMMAND,
  GIFT_PROFILE_UPDATE_COMMAND,
} from '../../lib/constants'
import { transformProfileRow, type ProfileRow } from '../../lib/profileRows'
import {
  createGiftCatalogCrudOpenApi,
  createGiftCatalogPagedListResponseSchema,
  giftCatalogCreatedSchema,
  giftCatalogOkSchema,
  giftProductProfileItemSchema,
} from '../openapi'

const listFields = [
  'id',
  'product_id',
  'occasions',
  'recipient_types',
  'is_customizable',
  'proof_required',
  'gift_wrap_available',
  'gift_message_max_length',
  'production_lead_time_days',
  'personalization_notes',
  'fulfillment_mode',
  'tenant_id',
  'organization_id',
  'created_at',
  // Required for the optimistic-lock round trip: clients send it back as the
  // expected version on update/delete.
  'updated_at',
]

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['gift_catalog.view'] },
    POST: { requireAuth: true, requireFeatures: ['gift_catalog.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['gift_catalog.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['gift_catalog.manage'] },
  },
  orm: {
    entity: GiftProductProfile,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: GIFT_PRODUCT_PROFILE_ENTITY_ID },
  list: {
    schema: giftProductProfileListSchema,
    entityId: GIFT_PRODUCT_PROFILE_ENTITY_ID,
    fields: listFields,
    sortFieldMap: {
      created_at: 'created_at',
      updated_at: 'updated_at',
      product_id: 'product_id',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query: GiftProductProfileListQuery, _ctx: CrudCtx): Promise<Where<ProfileRow>> => {
      const filters: Where<ProfileRow> = {}
      const F = filters as Record<string, WhereValue>
      if (query.id) F.id = query.id
      if (query.productId) F.product_id = query.productId
      if (typeof query.productIds === 'string' && query.productIds.trim().length > 0) {
        const productIds = parseIdsParam(query.productIds)
        // A supplied-but-malformed list must match nothing, never everything.
        F.product_id = { $in: productIds }
      }
      if (query.fulfillmentMode) F.fulfillment_mode = query.fulfillmentMode
      if (query.isCustomizable) F.is_customizable = query.isCustomizable === 'true'
      return filters
    },
    transformItem: (item: ProfileRow) => transformProfileRow(item),
  },
  actions: {
    create: {
      commandId: GIFT_PROFILE_CREATE_COMMAND,
      schema: giftProductProfileCreateSchema,
      mapInput: ({ parsed }) => parsed,
      response: ({ result }) => ({ id: String(result.id) }),
      status: 201,
    },
    update: {
      commandId: GIFT_PROFILE_UPDATE_COMMAND,
      schema: giftProductProfileUpdateSchema,
      mapInput: ({ parsed }) => parsed,
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: GIFT_PROFILE_DELETE_COMMAND,
      response: () => ({ ok: true }),
    },
  },
})

export const openApi = createGiftCatalogCrudOpenApi({
  resourceName: 'Gift Product Profile',
  pluralName: 'Gift Product Profiles',
  querySchema: giftProductProfileListSchema,
  listResponseSchema: createGiftCatalogPagedListResponseSchema(giftProductProfileItemSchema),
  create: {
    schema: giftProductProfileCreateSchema,
    responseSchema: giftCatalogCreatedSchema,
    description:
      'Creates the gift profile for a catalog product in the current organization. Returns 409 when the product already has a live profile and 404 when the product is not in scope.',
  },
  update: {
    schema: giftProductProfileUpdateSchema,
    responseSchema: giftCatalogOkSchema,
    description:
      'Updates a gift profile. Send the expected `updatedAt` in the optimistic-lock header; a stale version returns 409.',
  },
  del: {
    schema: deleteByIdSchema,
    responseSchema: giftCatalogOkSchema,
    description: 'Soft-deletes a gift profile. Recreating a profile for the same product revives it.',
  },
})
