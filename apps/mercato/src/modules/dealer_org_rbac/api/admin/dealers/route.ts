import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerHandler } from '../../../../lib/http'
import { DealerCapability } from '../../../../data/entities'
import { serializeCapabilities } from '../../../../commands/shared'
import { adminDealerTag, adminDealersListResponseSchema, commonAdminErrors } from '../../../openapi'
import { serializeDealerProfile } from '../../../../../dealer_onboarding/commands/register'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_org.admin'] },
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().optional(),
  state: z.string().optional(),
})

export const GET = dealerHandler('admin.dealers.list', async ({ req, container, auth }) => {
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const searchParams = new URL(req.url).searchParams
  const query = listQuerySchema.parse(Object.fromEntries(searchParams))
  const em = container.resolve<EntityManager>('em')

  const { DealerProfile } = await import('../../../../../dealer_onboarding/data/entities')
  const where: Record<string, unknown> = { tenantId: auth.tenantId, kycStatus: 'approved', deletedAt: null }
  if (query.search) {
    where.$or = [
      { businessName: { $ilike: `%${query.search}%` } },
      { contactEmail: { $ilike: `%${query.search}%` } },
    ]
  }
  if (query.state) {
    where.state = query.state
  }

  const offset = (query.page - 1) * query.pageSize
  const [profiles, total] = await em.findAndCount(
    DealerProfile,
    where as Parameters<typeof em.findAndCount>[1],
    { orderBy: { businessName: 'ASC' }, limit: query.pageSize, offset },
  )

  // Batch-load capabilities for all returned profiles.
  const profileIds = profiles.map((p) => p.id)
  const caps = profileIds.length
    ? await em.find(DealerCapability, { dealerProfileId: { $in: profileIds }, tenantId: auth.tenantId, deletedAt: null })
    : []
  const capByProfileId = new Map(caps.map((c) => [c.dealerProfileId, c]))

  const items = profiles.map((p) => ({
    ...serializeDealerProfile(p),
    capabilities: serializeCapabilities(capByProfileId.get(p.id) ?? null),
  }))

  return NextResponse.json({ items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminDealerTag,
  summary: 'List active dealers',
  methods: {
    GET: {
      summary: 'List approved dealers',
      description: 'Returns paged list of approved dealers with their capability summaries.',
      tags: [adminDealerTag],
      query: listQuerySchema,
      responses: [{ status: 200, description: 'Dealer list', schema: adminDealersListResponseSchema }],
      errors: commonAdminErrors(),
    },
  },
}
