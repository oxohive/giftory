import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerLedgerEntry } from '../../../../../data/entities'
import { ledgerListSchema } from '../../../../../data/validators'
import { adminHandler, readRouteParam } from '../../../../../lib/http'
import { serializeLedgerEntry } from '../../../../../commands/shared'
import { adminLedgerTag, pagedEntriesSchema } from '../../../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payouts.view'] },
}

/** GET /api/admin/dealers/:id/ledger — paged ledger entries for a dealer */
export const GET = adminHandler('admin.dealers.ledger.list', async ({ req, routeCtx, container, scope }) => {
  const dealerId = readRouteParam(routeCtx, 'id')
  if (!dealerId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const url = new URL(req.url)
  const query = ledgerListSchema.parse({
    ...Object.fromEntries(url.searchParams),
    dealerProfileId: dealerId,
  })

  const em = container.resolve<EntityManager>('em')
  const where: FilterQuery<DealerLedgerEntry> = {
    tenantId: scope.tenantId,
    dealerProfileId: dealerId,
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
  tag: adminLedgerTag,
  summary: 'Dealer payout ledger',
  pathParams: z.object({ id: z.string().uuid().describe('Dealer profile ID') }),
  methods: {
    GET: {
      summary: 'List dealer ledger entries',
      tags: [adminLedgerTag],
      responses: [{ status: 200, description: 'Paged entries', schema: pagedEntriesSchema }],
    },
  },
}
