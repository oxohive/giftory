import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import type { Where, WhereValue } from '@open-mercato/shared/lib/query/types'
import { GiftOccasion } from '../../data/entities'
import {
  deleteByIdSchema,
  giftOccasionCreateSchema,
  giftOccasionListSchema,
  giftOccasionUpdateSchema,
  type GiftOccasionListQuery,
} from '../../data/validators'
import {
  GIFT_OCCASION_CREATE_COMMAND,
  GIFT_OCCASION_DELETE_COMMAND,
  GIFT_OCCASION_ENTITY_ID,
  GIFT_OCCASION_UPDATE_COMMAND,
} from '../../lib/constants'
import { transformOccasionRow, type OccasionRow } from '../../lib/profileRows'
import {
  createGiftCatalogCrudOpenApi,
  createGiftCatalogPagedListResponseSchema,
  giftCatalogCreatedSchema,
  giftCatalogOkSchema,
  giftOccasionItemSchema,
} from '../openapi'

const listFields = [
  'id',
  'code',
  'label',
  'description',
  'sort_order',
  'is_active',
  'image_url',
  'tenant_id',
  'organization_id',
  'created_at',
  // Optimistic-lock version for CrudForm / row deletes.
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
    entity: GiftOccasion,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: GIFT_OCCASION_ENTITY_ID },
  list: {
    schema: giftOccasionListSchema,
    entityId: GIFT_OCCASION_ENTITY_ID,
    fields: listFields,
    sortFieldMap: {
      sort_order: 'sort_order',
      sortOrder: 'sort_order',
      code: 'code',
      label: 'label',
      created_at: 'created_at',
      updated_at: 'updated_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query: GiftOccasionListQuery, _ctx: CrudCtx): Promise<Where<OccasionRow>> => {
      const filters: Where<OccasionRow> = {}
      const F = filters as Record<string, WhereValue>
      if (query.id) F.id = query.id
      if (query.search) {
        const term = `%${escapeLikePattern(query.search)}%`
        F.label = { $ilike: term }
      }
      if (query.isActive) F.is_active = query.isActive === 'true'
      return filters
    },
    transformItem: (item: OccasionRow) => transformOccasionRow(item),
  },
  actions: {
    create: {
      commandId: GIFT_OCCASION_CREATE_COMMAND,
      schema: giftOccasionCreateSchema,
      mapInput: ({ parsed }) => parsed,
      response: ({ result }) => ({ id: String(result.id) }),
      status: 201,
    },
    update: {
      commandId: GIFT_OCCASION_UPDATE_COMMAND,
      schema: giftOccasionUpdateSchema,
      mapInput: ({ parsed }) => parsed,
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: GIFT_OCCASION_DELETE_COMMAND,
      response: () => ({ ok: true }),
    },
  },
})

export const openApi = createGiftCatalogCrudOpenApi({
  resourceName: 'Gift Occasion',
  pluralName: 'Gift Occasions',
  querySchema: giftOccasionListSchema,
  listResponseSchema: createGiftCatalogPagedListResponseSchema(giftOccasionItemSchema),
  create: {
    schema: giftOccasionCreateSchema,
    responseSchema: giftCatalogCreatedSchema,
    description: 'Creates an occasion lookup entry. The code is unique per organization (409 on clash).',
  },
  update: {
    schema: giftOccasionUpdateSchema,
    responseSchema: giftCatalogOkSchema,
    description: 'Updates an occasion. Send the expected `updatedAt` in the optimistic-lock header; a stale version returns 409.',
  },
  del: {
    schema: deleteByIdSchema,
    responseSchema: giftCatalogOkSchema,
    description: 'Soft-deletes an occasion. Recreating the same code revives it.',
  },
})
