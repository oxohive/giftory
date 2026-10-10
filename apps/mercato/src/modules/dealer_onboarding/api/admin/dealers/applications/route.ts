import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { buildQueryParams } from '@open-mercato/shared/lib/crud/query-params'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerHandler } from '../../../../lib/http'
import { adminApplicationsListSchema } from '../../../../data/validators'
import { DealerProfile } from '../../../../data/entities'
import { adminDealerTag, adminApplicationsListResponseSchema, commonAdminErrors } from '../../../openapi'
import { serializeDealerProfile } from '../../../../commands/register'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_onboarding.admin'] },
}

export const GET = dealerHandler('admin.dealers.applications', async ({ req, container, auth }) => {
  const tenantId = auth?.tenantId ?? null
  if (!tenantId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const query = adminApplicationsListSchema.parse(buildQueryParams(new URL(req.url).searchParams))
  const em = container.resolve<EntityManager>('em')

  const where: Record<string, unknown> = { tenantId, deletedAt: null }
  if (query.kycStatus) where.kycStatus = query.kycStatus
  if (query.search) {
    where.$or = [
      { businessName: { $ilike: `%${query.search}%` } },
      { contactEmail: { $ilike: `%${query.search}%` } },
    ]
  }

  const sortFieldMap: Record<string, string> = {
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    business_name: 'businessName',
    kyc_status: 'kycStatus',
  }
  const sortField = sortFieldMap[query.sortField ?? 'created_at'] ?? 'createdAt'
  const sortDir = (query.sortDir ?? 'desc').toUpperCase() as 'ASC' | 'DESC'

  const offset = (query.page - 1) * query.pageSize
  const [items, total] = await em.findAndCount(DealerProfile, where as Parameters<typeof em.findAndCount>[1], {
    orderBy: { [sortField]: sortDir },
    limit: query.pageSize,
    offset,
  })

  return NextResponse.json({
    items: items.map(serializeDealerProfile),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize),
  })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminDealerTag,
  summary: 'List dealer applications',
  methods: {
    GET: {
      summary: 'List dealer KYC applications',
      description: 'Returns a paged list of dealer applications, optionally filtered by KYC status.',
      tags: [adminDealerTag],
      query: adminApplicationsListSchema,
      responses: [{ status: 200, description: 'Paged applications', schema: adminApplicationsListResponseSchema }],
      errors: commonAdminErrors(),
    },
  },
}
