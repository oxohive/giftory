import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerLedgerEntry } from '../../../data/entities'
import { ledgerListSchema } from '../../../data/validators'
import { adminHandler } from '../../../lib/http'
import { serializeLedgerEntry, resolveOwnDealerProfileId } from '../../../commands/shared'
import { dealerLedgerTag, pagedEntriesSchema } from '../../openapi'

export const metadata = {
  // FEAT-009: replace with dealer-portal auth once RBAC is complete.
  GET: { requireAuth: true, requireFeatures: ['payouts.dealer_access'] },
}

/**
 * GET /api/dealer/ledger — own ledger entries.
 *
 * `dealerProfileId` is always derived from the caller's authenticated
 * tenant + organization scope; a caller-supplied `dealerProfileId` query
 * param (if present) is ignored. Fails closed (404) if the caller's org has
 * no approved dealer profile.
 */
export const GET = adminHandler('dealer.ledger.list', async ({ req, container, scope }) => {
  const url = new URL(req.url)
  const query = ledgerListSchema.parse(Object.fromEntries(url.searchParams))

  const em = container.resolve<EntityManager>('em')
  const dealerProfileId = await resolveOwnDealerProfileId(em, scope.organizationId, scope.tenantId)
  const where: FilterQuery<DealerLedgerEntry> = {
    tenantId: scope.tenantId,
    dealerProfileId,
    ...(query.entryType ? { entryType: query.entryType } : {}),
    ...(query.direction ? { direction: query.direction } : {}),
  } as FilterQuery<DealerLedgerEntry>

  const [entries, total] = await em.findAndCount(DealerLedgerEntry, where, {
    orderBy: { createdAt: 'DESC' } as never,
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })

  return NextResponse.json({ items: entries.map(serializeLedgerEntry), total, page: query.page, pageSize: query.pageSize })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerLedgerTag,
  summary: "Dealer's own ledger",
  methods: {
    GET: {
      summary: "List own ledger entries",
      tags: [dealerLedgerTag],
      responses: [{ status: 200, description: 'Paged entries', schema: pagedEntriesSchema }],
    },
  },
}
