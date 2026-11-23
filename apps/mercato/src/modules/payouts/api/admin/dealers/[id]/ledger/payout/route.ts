import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerLedgerEntry } from '../../../../../../data/entities'
import { recordPayoutSchema } from '../../../../../../data/validators'
import { PAYOUTS_LEDGER_RECORD_PAYOUT_COMMAND } from '../../../../../../lib/constants'
import { adminHandler, runAdminCommand, readRouteParam, readJsonBody } from '../../../../../../lib/http'
import {
  LEDGER_WRITE_SUCCESS_STATUS,
  hashLedgerRequest,
  ledgerWriteResponseBody,
  requireLedgerIdempotencyKey,
  runIdempotentLedgerWrite,
} from '../../../../../../lib/idempotency'
import { adminLedgerTag, ledgerWriteErrorSchema, ledgerWriteHeadersSchema } from '../../../../../openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payouts.manage'] },
}

/**
 * POST /api/admin/dealers/:id/ledger/payout — record a manual payout disbursement.
 *
 * Requires `Idempotency-Key`. Rejected with 422 `insufficient_balance` when
 * the amount exceeds the dealer's current `pendingAmount`; the check and the
 * insert run under a per-dealer lock (see `commands/entries.ts`).
 */
export const POST = adminHandler('admin.dealers.ledger.payout', async ({ req, routeCtx, container, scope, translate }) => {
  const idempotencyKey = requireLedgerIdempotencyKey(req, translate)
  const dealerId = readRouteParam(routeCtx, 'id')
  if (!dealerId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = recordPayoutSchema.parse({ ...body, dealerProfileId: dealerId })
  const requestHash = hashLedgerRequest('record_payout', dealerId, { amount: parsed.amount, note: parsed.note })

  return runIdempotentLedgerWrite({
    em: container.resolve<EntityManager>('em'),
    scope,
    ctx: { idempotencyKey, requestHash, operation: 'record_payout' },
    translate,
    execute: async () => {
      const result = await runAdminCommand<DealerLedgerEntry>(
        container,
        PAYOUTS_LEDGER_RECORD_PAYOUT_COMMAND,
        { ...parsed, dealerProfileId: dealerId, idempotencyKey, requestHash },
        scope,
        req,
      )
      return { status: LEDGER_WRITE_SUCCESS_STATUS, body: ledgerWriteResponseBody(result) }
    },
  })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminLedgerTag,
  summary: 'Record payout disbursement',
  pathParams: z.object({ id: z.string().uuid().describe('Dealer profile ID') }),
  methods: {
    POST: {
      summary: 'Record manual payout disbursement',
      description:
        'Requires an Idempotency-Key header. Repeating the same key with the same body replays the original 201 ' +
        '(header Idempotent-Replayed: true) without writing a second entry; the same key with a different body is 409 ' +
        "idempotency_key_reused. A payout larger than the dealer's pendingAmount is 422 insufficient_balance.",
      tags: [adminLedgerTag],
      headers: ledgerWriteHeadersSchema,
      requestBody: {
        contentType: 'application/json',
        schema: z.object({
          amount: z.number().int().positive().describe('Amount in INR paise'),
          note: z.string().min(1).describe('Payment reference, e.g. UTR number'),
        }),
      },
      responses: [{ status: 201, description: 'Entry created (or replayed)', schema: z.object({ id: z.string().uuid() }) }],
      errors: [
        { status: 400, description: 'Missing or malformed Idempotency-Key', schema: ledgerWriteErrorSchema },
        { status: 409, description: 'Idempotency-Key reused for a different request', schema: ledgerWriteErrorSchema },
        { status: 422, description: 'Invalid body, or insufficient_balance', schema: ledgerWriteErrorSchema },
      ],
    },
  },
}
