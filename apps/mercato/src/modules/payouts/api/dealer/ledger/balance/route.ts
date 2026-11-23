import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { loadDealerBalance } from '../../../../lib/balance'
import { adminHandler } from '../../../../lib/http'
import { resolveOwnDealerProfileId } from '../../../../commands/shared'
import { dealerLedgerTag, balanceSchema } from '../../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payouts.dealer_access'] },
}

/**
 * GET /api/dealer/ledger/balance — own current balance.
 *
 * `dealerProfileId` is always derived from the caller's authenticated
 * tenant + organization scope; it is no longer accepted (or required) as a
 * query param, since a caller-supplied value was never compared against the
 * session and let any dealer read any other dealer's balance. Fails closed
 * (404) if the caller's org has no approved dealer profile.
 */
export const GET = adminHandler('dealer.ledger.balance', async ({ container, scope }) => {
  const em = container.resolve<EntityManager>('em')
  const dealerProfileId = await resolveOwnDealerProfileId(em, scope.organizationId, scope.tenantId)

  // pendingAmount = Σ credits − Σ debits; totalEarned = Σ commission_earned
  // (see lib/balance.ts — the same function backs the payout balance guard).
  const balance = await loadDealerBalance(em, scope.tenantId, dealerProfileId)

  return NextResponse.json({
    dealerProfileId: dealerProfileId,
    pendingAmount: balance.pendingAmount,
    totalEarned: balance.totalEarned,
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
