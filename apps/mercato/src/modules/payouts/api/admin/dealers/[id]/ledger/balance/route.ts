import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { adminHandler, readRouteParam } from '../../../../../../lib/http'
import { adminLedgerTag, balanceSchema } from '../../../../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payouts.view'] },
}

/** GET /api/admin/dealers/:id/ledger/balance — current balance for a dealer */
export const GET = adminHandler('admin.dealers.ledger.balance', async ({ routeCtx, container, scope }) => {
  const dealerId = readRouteParam(routeCtx, 'id')
  if (!dealerId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const em = container.resolve<EntityManager>('em')
  const rows = await em.getConnection().execute<
    Array<{ total_earned: string; total_debited: string }>
  >(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = 'credit' AND entry_type = 'commission_earned' THEN amount::bigint ELSE 0 END), 0) AS total_earned,
       COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount::bigint ELSE 0 END), 0)                                       AS total_debited
     FROM dealer_ledger_entries
     WHERE tenant_id = ? AND dealer_profile_id = ?`,
    [scope.tenantId, dealerId],
  )

  const row = rows[0] ?? { total_earned: '0', total_debited: '0' }
  const totalEarned = parseInt(row.total_earned, 10)
  const totalDebited = parseInt(row.total_debited, 10)

  return NextResponse.json({
    dealerProfileId: dealerId,
    pendingAmount: totalEarned - totalDebited,
    totalEarned,
    currencyCode: 'INR',
  })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminLedgerTag,
  summary: 'Dealer balance',
  pathParams: z.object({ id: z.string().uuid().describe('Dealer profile ID') }),
  methods: {
    GET: {
      summary: 'Get dealer current balance',
      tags: [adminLedgerTag],
      responses: [{ status: 200, description: 'Balance', schema: balanceSchema }],
    },
  },
}
