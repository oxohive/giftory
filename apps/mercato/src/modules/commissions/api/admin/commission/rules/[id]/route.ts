import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { CommissionRule } from '../../../../../data/entities.js'
import { COMMISSION_RULE_DEACTIVATE_COMMAND } from '../../../../../lib/constants.js'
import { adminHandler, runAdminCommand, readRouteParam } from '../../../../../lib/http.js'
import { serializeCommissionRule } from '../../../../../commands/shared.js'
import { adminRulesTag, serializedRuleSchema } from '../../../../openapi.js'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['commissions.view'] },
  DELETE: { requireAuth: true, requireFeatures: ['commissions.manage'] },
}

/** GET /api/admin/commission/rules/:id */
export const GET = adminHandler('admin.commission.rules.get', async ({ routeCtx, container, scope, translate }) => {
  const id = readRouteParam(routeCtx, 'id')
  if (!id) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const em = container.resolve<EntityManager>('em')

  const rule = await em.findOne(CommissionRule, { id, tenantId: scope.tenantId } as FilterQuery<CommissionRule>)
  if (!rule) return NextResponse.json({ error: translate('commissions.errors.ruleNotFound', 'Rule not found'), code: 'not_found' }, { status: 404 })

  return NextResponse.json({ rule: serializeCommissionRule(rule) })
})

/** DELETE /api/admin/commission/rules/:id — deactivate (soft) */
export const DELETE = adminHandler('admin.commission.rules.deactivate', async ({ req, routeCtx, container, scope }) => {
  const id = readRouteParam(routeCtx, 'id')
  if (!id) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  await runAdminCommand(container, COMMISSION_RULE_DEACTIVATE_COMMAND, { id }, scope, req)
  return NextResponse.json({ ok: true })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminRulesTag,
  summary: 'Single commission rule',
  pathParams: z.object({ id: z.string().uuid().describe('Rule ID') }),
  methods: {
    GET: {
      summary: 'Get commission rule',
      tags: [adminRulesTag],
      responses: [{ status: 200, description: 'Rule detail', schema: z.object({ rule: serializedRuleSchema }) }],
    },
    DELETE: {
      summary: 'Deactivate commission rule',
      tags: [adminRulesTag],
      responses: [{ status: 200, description: 'Deactivated', schema: z.object({ ok: z.literal(true) }) }],
    },
  },
}
