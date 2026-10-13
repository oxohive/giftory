import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { adminHandler } from '../../../../lib/http'
import { dealerLedgerTag, balanceSchema } from '../../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payouts.dealer_access'] },
}

/**
 * GET /api/dealer/ledger/balance — own current balance.
 *
 * FEAT-009 note: resolve dealerProfileId from session once RBAC ships.
 * Until then the caller passes it as a query param.
 */
export const GET = adminHandler('dealer.ledger.balance', async ({ req, container, scope }) => {
  const url = new URL(req.url)
  const dealerProfileId = url.searchParams.get('dealerProfileId')
  if (!dealerProfileId) return NextResponse.json({ error: 'dealerProfileId is required' }, { status: 400 })

  const em = container.resolve<EntityManager>('em')
  const rows = await em.getConnection().execute<
    Array<{ total_earned: string; total_debited: string }>
  >(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = 'credit' AND entry_type = 'commission_earned' THEN amount::bigint ELSE 0 END), 0) AS total_earned,
       COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount::bigint ELSE 0 END), 0)                                       AS total_debited
     FROM dealer_ledger_entries
     WHERE tenant_id = ? AND dealer_profile_id = ?`,
    [scope.tenantId, dealerProfileId],
  )

  const row = rows[0] ?? { total_earned: '0', total_debited: '0' }
  const totalEarned = parseInt(row.total_earned, 10)
  const totalDebited = parseInt(row.total_debited, 10)

  return NextResponse.json({
    dealerProfileId,
    pendingAmount: totalEarned - totalDebited,
    totalEarned,
    currencyCode: 'INR',
  })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerLedgerTag,
  summary: "Dealer's own balance",
  methods: {
    GET: {
      summary: 'Get own current balance',
      tags: [dealerLedgerTag],
      responses: [{ status: 200, description: 'Balance', schema: balanceSchema }],
    },
  },
}
