import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerLedgerEntry } from '../../../../../../data/entities'
import { createAdjustmentSchema } from '../../../../../../data/validators'
import { PAYOUTS_LEDGER_CREATE_ADJUSTMENT_COMMAND } from '../../../../../../lib/constants'
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
 * POST /api/admin/dealers/:id/ledger/adjustment — create a manual adjustment entry.
 *
 * Requires `Idempotency-Key` (same replay semantics as the payout route).
 * Adjustments are not balance-guarded; an `adjustment_debit` may take the
 * balance below zero.
 */
export const POST = adminHandler('admin.dealers.ledger.adjustment', async ({ req, routeCtx, container, scope, translate }) => {
  const idempotencyKey = requireLedgerIdempotencyKey(req, translate)
  const dealerId = readRouteParam(routeCtx, 'id')
  if (!dealerId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = createAdjustmentSchema.parse({ ...body, dealerProfileId: dealerId })
  const requestHash = hashLedgerRequest('create_adjustment', dealerId, {
    direction: parsed.direction,
    amount: parsed.amount,
    note: parsed.note,
  })

  return runIdempotentLedgerWrite({
    em: container.resolve<EntityManager>('em'),
    scope,
    ctx: { idempotencyKey, requestHash, operation: 'create_adjustment' },
    translate,
    execute: async () => {
      const result = await runAdminCommand<DealerLedgerEntry>(
        container,
        PAYOUTS_LEDGER_CREATE_ADJUSTMENT_COMMAND,
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
  summary: 'Create ledger adjustment',
  pathParams: z.object({ id: z.string().uuid().describe('Dealer profile ID') }),
  methods: {
    POST: {
      summary: 'Create adjustment entry (credit or debit)',
      description:
        'Requires an Idempotency-Key header. Repeating the same key with the same body replays the original 201 ' +
        '(header Idempotent-Replayed: true) without writing a second entry; the same key with a different body is 409 ' +
        'idempotency_key_reused.',
      tags: [adminLedgerTag],
      headers: ledgerWriteHeadersSchema,
      requestBody: {
        contentType: 'application/json',
        schema: z.object({
          direction: z.enum(['credit', 'debit']),
          amount: z.number().int().positive().describe('Amount in INR paise'),
          note: z.string().min(1).describe('Mandatory reason for adjustment'),
        }),
      },
      responses: [{ status: 201, description: 'Entry created (or replayed)', schema: z.object({ id: z.string().uuid() }) }],
      errors: [
        { status: 400, description: 'Missing or malformed Idempotency-Key', schema: ledgerWriteErrorSchema },
        { status: 409, description: 'Idempotency-Key reused for a different request', schema: ledgerWriteErrorSchema },
        { status: 422, description: 'Invalid body', schema: ledgerWriteErrorSchema },
      ],
    },
  },
}
