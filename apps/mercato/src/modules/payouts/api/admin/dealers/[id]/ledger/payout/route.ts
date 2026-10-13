import { NextResponse } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerLedgerEntry } from '../../../../../../data/entities'
import { recordPayoutSchema } from '../../../../../../data/validators'
import { PAYOUTS_LEDGER_RECORD_PAYOUT_COMMAND } from '../../../../../../lib/constants'
import { adminHandler, runAdminCommand, readRouteParam, readJsonBody } from '../../../../../../lib/http'
import { adminLedgerTag } from '../../../../../openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payouts.manage'] },
}

/** POST /api/admin/dealers/:id/ledger/payout — record a manual payout disbursement */
export const POST = adminHandler('admin.dealers.ledger.payout', async ({ req, routeCtx, container, scope }) => {
  const dealerId = readRouteParam(routeCtx, 'id')
  if (!dealerId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = recordPayoutSchema.parse({ ...body, dealerProfileId: dealerId })

  const result = await runAdminCommand<DealerLedgerEntry>(
    container,
    PAYOUTS_LEDGER_RECORD_PAYOUT_COMMAND,
    { ...parsed, dealerProfileId: dealerId },
    scope,
    req,
  )
  return NextResponse.json({ id: result.id }, { status: 201 })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminLedgerTag,
  summary: 'Record payout disbursement',
  pathParams: z.object({ id: z.string().uuid().describe('Dealer profile ID') }),
  methods: {
    POST: {
      summary: 'Record manual payout disbursement',
      tags: [adminLedgerTag],
      requestBody: {
        contentType: 'application/json',
        schema: z.object({
          amount: z.number().int().positive().describe('Amount in INR paise'),
          note: z.string().min(1).describe('Payment reference, e.g. UTR number'),
        }),
      },
      responses: [{ status: 201, description: 'Entry created', schema: z.object({ id: z.string().uuid() }) }],
    },
  },
}
