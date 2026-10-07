import { z, type ZodTypeAny } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  createCrudOpenApiFactory,
  createPagedListResponseSchema,
  type CrudOpenApiOptions,
} from '@open-mercato/shared/lib/openapi/crud'
import { GIFT_FULFILLMENT_MODES } from '../lib/constants'

export const giftCatalogTag = 'Gift Catalog'
export const giftCatalogStorefrontTag = 'Gift Catalog Storefront'

export const giftCatalogOkSchema = z.object({ ok: z.literal(true) })
export const giftCatalogCreatedSchema = z.object({ id: z.string().uuid() })
export const giftCatalogErrorSchema = z.object({ error: z.string() }).passthrough()

export const giftProductProfileItemSchema = z
  .object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    occasions: z.array(z.string()),
    recipientTypes: z.array(z.string()),
    isCustomizable: z.boolean(),
    proofRequired: z.boolean(),
    giftWrapAvailable: z.boolean(),
    giftMessageMaxLength: z.number().int(),
    productionLeadTimeDays: z.number().int().nullable(),
    personalizationNotes: z.string().nullable(),
    fulfillmentMode: z.enum(GIFT_FULFILLMENT_MODES),
    organizationId: z.string().uuid().nullable().optional(),
    tenantId: z.string().uuid().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable(),
  })
  .passthrough()

export const giftOccasionItemSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    imageUrl: z.string().nullable(),
    organizationId: z.string().uuid().nullable().optional(),
    tenantId: z.string().uuid().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable(),
  })
  .passthrough()

export function createGiftCatalogPagedListResponseSchema(itemSchema: ZodTypeAny) {
  return createPagedListResponseSchema(itemSchema, { paginationMetaOptional: true })
}

const buildGiftCatalogCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: giftCatalogTag,
  defaultCreateResponseSchema: giftCatalogCreatedSchema,
  defaultOkResponseSchema: giftCatalogOkSchema,
  makeListDescription: ({ pluralLower }) =>
    `Returns a paginated collection of ${pluralLower} in the current tenant and organization scope.`,
})

export function createGiftCatalogCrudOpenApi(options: CrudOpenApiOptions): OpenApiRouteDoc {
  return buildGiftCatalogCrudOpenApi(options)
}
