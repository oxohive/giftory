import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest, isUniqueViolation } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerLedgerEntry, PayoutsIdempotencyKey } from '../data/entities'
import { recordPayoutSchema, createAdjustmentSchema } from '../data/validators'
import {
  ENTRY_TYPE_DIRECTION,
  LEDGER_ENTRY_RESOURCE_KIND,
  DEFAULT_CURRENCY_CODE,
  PAYOUTS_LEDGER_CREDIT_COMMISSION_COMMAND,
  PAYOUTS_LEDGER_RECORD_PAYOUT_COMMAND,
  PAYOUTS_LEDGER_CREATE_ADJUSTMENT_COMMAND,
} from '../lib/constants'
import type { EntryType, ReferenceType } from '../lib/constants'
import { loadDealerBalance, type DealerLedgerBalance } from '../lib/balance'
import { PayoutsError, type Translate } from '../lib/errors'
import {
  LEDGER_WRITE_SUCCESS_STATUS,
  LedgerIdempotencyRaceError,
  PAYOUTS_IDEMPOTENCY_UNIQUE_CONSTRAINT,
  ledgerWriteResponseBody,
  type LedgerIdempotencyOperation,
} from '../lib/idempotency'
import { resolveCommandScope, serializeLedgerEntry, type PayoutsScope } from './shared'
import eventsConfig from '../events'

const systemScopeSchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

// ── Credit commission (system-actor, triggered by commission.snapshot_created) ─

const creditCommissionSchema = z.object({
  dealerProfileId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  commissionAmount: z.number().int().nonnegative(),
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

const creditCommissionCommand: CommandHandler<Record<string, unknown>, DealerLedgerEntry> = {
  id: PAYOUTS_LEDGER_CREDIT_COMMISSION_COMMAND,
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = creditCommissionSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    // This command is always system-triggered (the credit-on-snapshot subscriber),
    // never called with a real authenticated user — `created_by` is nullable for
    // exactly this case. Do not substitute a sentinel like "system": the column is
    // `uuid` and a non-UUID string there fails the insert outright.
    const userId = ctx.auth?.sub && ctx.auth.sub !== 'system' ? ctx.auth.sub : null

    // Credits only ever increase the balance, so they cannot make a concurrent
    // payout unsafe — no dealer lock is needed here.
    const entry = await de.createOrmEntity({
      entity: DealerLedgerEntry,
      data: {
        dealerProfileId: parsed.dealerProfileId,
        tenantId: scope.tenantId,
        entryType: 'commission_earned' as EntryType,
        amount: String(parsed.commissionAmount),
        currencyCode: DEFAULT_CURRENCY_CODE,
        direction: ENTRY_TYPE_DIRECTION['commission_earned'],
        referenceType: 'order_commission_snapshot',
        referenceId: parsed.snapshotId,
        note: null,
        createdBy: userId,
      },
    })

    await eventsConfig.emit('payouts.ledger_entry_created', {
      id: entry.id,
      dealerProfileId: entry.dealerProfileId,
      tenantId: scope.tenantId,
      entryType: entry.entryType,
      amount: parsed.commissionAmount,
      direction: entry.direction,
    })

    return entry
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('payouts.audit.creditCommission', 'Credit commission earned'),
      resourceKind: LEDGER_ENTRY_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.tenantId),
      snapshotAfter: serializeLedgerEntry(result),
    }
  },
}

// ── Guarded, idempotent admin ledger writes (payout + adjustment) ─────────────

/**
 * The commands below are only ever invoked by the admin ledger routes, which
 * take the key from the `Idempotency-Key` header and the hash from the
 * validated body (see `lib/idempotency.ts`). Both are required here so a
 * future caller cannot accidentally bypass the replay store.
 */
const ledgerIdempotencySchema = z.object({
  idempotencyKey: z.string().min(1),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
})

/**
 * Transaction-scoped Postgres advisory lock serialising every guarded write
 * for one dealer's ledger (tenant + dealer profile). Released automatically
 * at COMMIT/ROLLBACK. `hashtextextended` maps the text key to the bigint the
 * lock function takes; a hash collision between two dealers only means they
 * briefly serialise, never a correctness problem.
 */
export const DEALER_LEDGER_LOCK_SQL = 'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))'

export function dealerLedgerLockKey(tenantId: string, dealerProfileId: string): string {
  return `payouts.dealer_ledger:${tenantId}:${dealerProfileId}`
}

/**
 * Balance guard (Known gap #3): a payout may not exceed what the ledger says
 * is still owed to the dealer (`pendingAmount`, see `lib/balance.ts`). A
 * payout equal to the balance is allowed and leaves it at exactly zero.
 */
export function assertPayoutWithinBalance(
  balance: Pick<DealerLedgerBalance, 'pendingAmount'>,
  amount: number,
  translate: Translate,
): void {
  if (amount > balance.pendingAmount) {
    throw new PayoutsError(
      422,
      'insufficient_balance',
      translate('payouts.errors.insufficientBalance', "Payout amount exceeds the dealer's available balance"),
      { availableAmount: balance.pendingAmount, requestedAmount: amount },
    )
  }
}

type GuardedLedgerWrite = {
  dealerProfileId: string
  entryType: Exclude<EntryType, 'commission_earned'>
  referenceType: ReferenceType
  amount: number
  note: string
  operation: LedgerIdempotencyOperation
  idempotencyKey: string
  requestHash: string
  /** Reject when `amount` exceeds the current balance (payouts only). */
  enforceBalance: boolean
}

/**
 * Appends one ledger entry inside a single transaction that:
 *   1. takes the per-dealer advisory lock,
 *   2. re-checks the idempotency key (a concurrent duplicate that committed
 *      while we waited for the lock is visible now — READ COMMITTED takes a
 *      fresh snapshot per statement),
 *   3. for payouts, re-reads the balance and rejects an overdraw,
 *   4. inserts the ledger entry AND its idempotency row, then commits.
 *
 * Any failure rolls back both rows, so the key is only consumed when the
 * entry exists. The ledger stays append-only: nothing is updated or deleted.
 * The `payouts.ledger_entry_created` event is emitted after COMMIT.
 */
export async function writeGuardedLedgerEntry(
  ctx: CommandRuntimeContext,
  scope: PayoutsScope,
  userId: string,
  spec: GuardedLedgerWrite,
): Promise<DealerLedgerEntry> {
  const em = ctx.container.resolve<EntityManager>('em')
  const { translate } = await resolveTranslations()
  const entryId = randomUUID()

  const entry = await em.transactional(async (tem) => {
    await tem.execute(DEALER_LEDGER_LOCK_SQL, [dealerLedgerLockKey(scope.tenantId, spec.dealerProfileId)])

    const consumed = await tem.findOne(PayoutsIdempotencyKey, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      idempotencyKey: spec.idempotencyKey,
    } as FilterQuery<PayoutsIdempotencyKey>)
    if (consumed) throw new LedgerIdempotencyRaceError()

    if (spec.enforceBalance) {
      const balance = await loadDealerBalance(tem, scope.tenantId, spec.dealerProfileId)
      assertPayoutWithinBalance(balance, spec.amount, translate)
    }

    const now = new Date()
    const created = tem.create(DealerLedgerEntry, {
      id: entryId,
      dealerProfileId: spec.dealerProfileId,
      tenantId: scope.tenantId,
      entryType: spec.entryType,
      amount: String(spec.amount),
      currencyCode: DEFAULT_CURRENCY_CODE,
      direction: ENTRY_TYPE_DIRECTION[spec.entryType],
      referenceType: spec.referenceType,
      // No separate source entity for manual payouts/adjustments — the entry
      // references itself.
      referenceId: entryId,
      note: spec.note,
      createdBy: userId,
      createdAt: now,
    })
    const keyRow = tem.create(PayoutsIdempotencyKey, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      idempotencyKey: spec.idempotencyKey,
      operation: spec.operation,
      requestHash: spec.requestHash,
      ledgerEntryId: entryId,
      responseStatus: LEDGER_WRITE_SUCCESS_STATUS,
      responseBody: ledgerWriteResponseBody({ id: entryId }),
      createdBy: userId,
      createdAt: now,
    })
    tem.persist(created)
    tem.persist(keyRow)
    try {
      await tem.flush()
    } catch (err) {
      // Same key used concurrently for a different dealer (different advisory
      // lock): the unique constraint is the backstop. Our transaction rolls back.
      if (isUniqueViolation(err, PAYOUTS_IDEMPOTENCY_UNIQUE_CONSTRAINT)) throw new LedgerIdempotencyRaceError()
      throw err
    }
    return created
  })

  await eventsConfig.emit('payouts.ledger_entry_created', {
    id: entry.id,
    dealerProfileId: entry.dealerProfileId,
    tenantId: scope.tenantId,
    entryType: entry.entryType,
    amount: spec.amount,
    direction: entry.direction,
  })

  return entry
}

// ── Record payout (admin) ─────────────────────────────────────────────────────

const recordPayoutCommandSchema = recordPayoutSchema.and(systemScopeSchema).and(ledgerIdempotencySchema)

export async function executeRecordPayout(
  rawInput: Record<string, unknown>,
  ctx: CommandRuntimeContext,
): Promise<DealerLedgerEntry> {
  const parsed = recordPayoutCommandSchema.parse(rawInput)
  const scope = resolveCommandScope(ctx, rawInput)
  const userId = ctx.auth?.sub ?? null
  if (!userId) throw badRequest('[internal] payouts recordPayout requires an authenticated user')

  return writeGuardedLedgerEntry(ctx, scope, String(userId), {
    dealerProfileId: parsed.dealerProfileId,
    entryType: 'payout_disbursed',
    referenceType: 'manual_payout',
    amount: parsed.amount,
    note: parsed.note,
    operation: 'record_payout',
    idempotencyKey: parsed.idempotencyKey,
    requestHash: parsed.requestHash,
    enforceBalance: true,
  })
}

const recordPayoutCommand: CommandHandler<Record<string, unknown>, DealerLedgerEntry> = {
  id: PAYOUTS_LEDGER_RECORD_PAYOUT_COMMAND,
  isUndoable: false,
  execute: executeRecordPayout,
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('payouts.audit.recordPayout', 'Record payout disbursement'),
      resourceKind: LEDGER_ENTRY_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.tenantId),
      snapshotAfter: serializeLedgerEntry(result),
    }
  },
}

// ── Create adjustment (admin) ─────────────────────────────────────────────────

const createAdjustmentCommandSchema = createAdjustmentSchema.and(systemScopeSchema).and(ledgerIdempotencySchema)

/**
 * Adjustments are corrections and are deliberately NOT balance-guarded: an
 * `adjustment_debit` (e.g. a clawback for a refunded order) may legitimately
 * take the balance below zero. They still take the dealer lock so a payout
 * racing with an adjustment always checks a consistent balance.
 */
export async function executeCreateAdjustment(
  rawInput: Record<string, unknown>,
  ctx: CommandRuntimeContext,
): Promise<DealerLedgerEntry> {
  const parsed = createAdjustmentCommandSchema.parse(rawInput)
  const scope = resolveCommandScope(ctx, rawInput)
  const userId = ctx.auth?.sub ?? null
  if (!userId) throw badRequest('[internal] payouts createAdjustment requires an authenticated user')

  return writeGuardedLedgerEntry(ctx, scope, String(userId), {
    dealerProfileId: parsed.dealerProfileId,
    entryType: parsed.direction === 'credit' ? 'adjustment_credit' : 'adjustment_debit',
    referenceType: 'adjustment',
    amount: parsed.amount,
    note: parsed.note,
    operation: 'create_adjustment',
    idempotencyKey: parsed.idempotencyKey,
    requestHash: parsed.requestHash,
    enforceBalance: false,
  })
}

const createAdjustmentCommand: CommandHandler<Record<string, unknown>, DealerLedgerEntry> = {
  id: PAYOUTS_LEDGER_CREATE_ADJUSTMENT_COMMAND,
  isUndoable: false,
  execute: executeCreateAdjustment,
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('payouts.audit.createAdjustment', 'Create ledger adjustment'),
      resourceKind: LEDGER_ENTRY_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.tenantId),
      snapshotAfter: serializeLedgerEntry(result),
    }
  },
}

registerCommand(creditCommissionCommand)
registerCommand(recordPayoutCommand)
registerCommand(createAdjustmentCommand)
