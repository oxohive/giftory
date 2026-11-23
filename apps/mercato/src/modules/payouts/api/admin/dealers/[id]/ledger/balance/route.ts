import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { loadDealerBalance } from '../../../../../../lib/balance'
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
  // pendingAmount = Σ credits − Σ debits; totalEarned = Σ commission_earned
  // (see lib/balance.ts — the same function backs the payout balance guard).
  const balance = await loadDealerBalance(em, scope.tenantId, dealerId)

  return NextResponse.json({
    dealerProfileId: dealerId,
    pendingAmount: balance.pendingAmount,
    totalEarned: balance.totalEarned,
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
