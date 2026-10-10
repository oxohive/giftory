import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { CommissionRule } from '../../../../data/entities.js'
import { commissionRuleCreateSchema, commissionRuleListSchema } from '../../../../data/validators.js'
import { COMMISSION_RULE_CREATE_COMMAND } from '../../../../lib/constants.js'
import { adminHandler, runAdminCommand, readJsonBody } from '../../../../lib/http.js'
import { serializeCommissionRule } from '../../../../commands/shared.js'
import { adminRulesTag, pagedRulesSchema, serializedRuleSchema } from '../../../openapi.js'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['commissions.view'] },
  POST: { requireAuth: true, requireFeatures: ['commissions.manage'] },
}

/** GET /api/admin/commission/rules — list commission rules */
export const GET = adminHandler('admin.commission.rules.list', async ({ req, container, scope }) => {
  const url = new URL(req.url)
  const query = commissionRuleListSchema.parse(Object.fromEntries(url.searchParams))

  const em = container.resolve<EntityManager>('em')
  const where: FilterQuery<CommissionRule> = {
    tenantId: scope.tenantId,
    ...(query.dealerProfileId ? { dealerProfileId: query.dealerProfileId } : {}),
    ...(query.productTypeCode ? { productTypeCode: query.productTypeCode } : {}),
    ...(query.activeOnly ? { effectiveTo: null } : {}),
  } as FilterQuery<CommissionRule>

  const [rules, total] = await em.findAndCount(CommissionRule, where, {
    orderBy: { effectiveFrom: 'DESC' } as never,
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })

  return NextResponse.json({ items: rules.map(serializeCommissionRule), total, page: query.page, pageSize: query.pageSize })
})

/** POST /api/admin/commission/rules — create a commission rule */
export const POST = adminHandler('admin.commission.rules.create', async ({ req, container, scope }) => {
  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = commissionRuleCreateSchema.parse(body)

  const result = await runAdminCommand<CommissionRule>(
    container, COMMISSION_RULE_CREATE_COMMAND, { ...parsed }, scope, req,
  )
  return NextResponse.json({ id: result.id }, { status: 201 })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminRulesTag,
  summary: 'Commission rules',
  methods: {
    GET: {
      summary: 'List commission rules',
      tags: [adminRulesTag],
      responses: [{ status: 200, description: 'Paged rules', schema: pagedRulesSchema }],
    },
    POST: {
      summary: 'Create commission rule',
      tags: [adminRulesTag],
      requestBody: { contentType: 'application/json', schema: commissionRuleCreateSchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string().uuid() }) }],
    },
  },
}
