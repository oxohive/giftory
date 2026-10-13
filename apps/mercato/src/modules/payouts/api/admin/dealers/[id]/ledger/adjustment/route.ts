import { NextResponse } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerLedgerEntry } from '../../../../../../data/entities'
import { createAdjustmentSchema } from '../../../../../../data/validators'
import { PAYOUTS_LEDGER_CREATE_ADJUSTMENT_COMMAND } from '../../../../../../lib/constants'
import { adminHandler, runAdminCommand, readRouteParam, readJsonBody } from '../../../../../../lib/http'
import { adminLedgerTag } from '../../../../../openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payouts.manage'] },
}

/** POST /api/admin/dealers/:id/ledger/adjustment — create a manual adjustment entry */
export const POST = adminHandler('admin.dealers.ledger.adjustment', async ({ req, routeCtx, container, scope }) => {
  const dealerId = readRouteParam(routeCtx, 'id')
  if (!dealerId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = createAdjustmentSchema.parse({ ...body, dealerProfileId: dealerId })

  const result = await runAdminCommand<DealerLedgerEntry>(
    container,
    PAYOUTS_LEDGER_CREATE_ADJUSTMENT_COMMAND,
    { ...parsed, dealerProfileId: dealerId },
    scope,
    req,
  )
  return NextResponse.json({ id: result.id }, { status: 201 })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminLedgerTag,
  summary: 'Create ledger adjustment',
  pathParams: z.object({ id: z.string().uuid().describe('Dealer profile ID') }),
  methods: {
    POST: {
      summary: 'Create adjustment entry (credit or debit)',
      tags: [adminLedgerTag],
      requestBody: {
        contentType: 'application/json',
        schema: z.object({
          direction: z.enum(['credit', 'debit']),
          amount: z.number().int().positive().describe('Amount in INR paise'),
          note: z.string().min(1).describe('Mandatory reason for adjustment'),
        }),
      },
      responses: [{ status: 201, description: 'Entry created', schema: z.object({ id: z.string().uuid() }) }],
    },
  },
}
