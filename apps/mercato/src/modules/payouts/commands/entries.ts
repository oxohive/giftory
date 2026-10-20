import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerLedgerEntry } from '../data/entities'
import { recordPayoutSchema, createAdjustmentSchema } from '../data/validators'
import {
  ENTRY_TYPE_DIRECTION,
  LEDGER_ENTRY_RESOURCE_KIND,
  DEFAULT_CURRENCY_CODE,
  PAYOUTS_LEDGER_CREDIT_COMMISSION_COMMAND,
  PAYOUTS_LEDGER_RECORD_PAYOUT_COMMAND,
  PAYOUTS_LEDGER_CREATE_ADJUSTMENT_COMMAND,
} from '../lib/constants'
import type { EntryType } from '../lib/constants'
import { resolveCommandScope, serializeLedgerEntry } from './shared'
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

// ── Record payout (admin) ─────────────────────────────────────────────────────

const recordPayoutCommandSchema = recordPayoutSchema.and(systemScopeSchema)

const recordPayoutCommand: CommandHandler<Record<string, unknown>, DealerLedgerEntry> = {
  id: PAYOUTS_LEDGER_RECORD_PAYOUT_COMMAND,
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = recordPayoutCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const userId = ctx.auth?.sub ?? null
    if (!userId) throw badRequest('[internal] payouts recordPayout requires an authenticated user')

    // For manual_payout entries there is no separate entity — use a fresh UUID
    // as both the entry id and the self-referencing referenceId.
    const entryId = randomUUID()

    const entry = await de.createOrmEntity({
      entity: DealerLedgerEntry,
      data: {
        id: entryId,
        dealerProfileId: parsed.dealerProfileId,
        tenantId: scope.tenantId,
        entryType: 'payout_disbursed' as EntryType,
        amount: String(parsed.amount),
        currencyCode: DEFAULT_CURRENCY_CODE,
        direction: ENTRY_TYPE_DIRECTION['payout_disbursed'],
        referenceType: 'manual_payout',
        referenceId: entryId,
        note: parsed.note,
        createdBy: String(userId),
      },
    })

    await eventsConfig.emit('payouts.ledger_entry_created', {
      id: entry.id,
      dealerProfileId: entry.dealerProfileId,
      tenantId: scope.tenantId,
      entryType: entry.entryType,
      amount: parsed.amount,
      direction: entry.direction,
    })

    return entry
  },
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

const createAdjustmentCommandSchema = createAdjustmentSchema.and(systemScopeSchema)

const createAdjustmentCommand: CommandHandler<Record<string, unknown>, DealerLedgerEntry> = {
  id: PAYOUTS_LEDGER_CREATE_ADJUSTMENT_COMMAND,
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = createAdjustmentCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const userId = ctx.auth?.sub ?? null
    if (!userId) throw badRequest('[internal] payouts createAdjustment requires an authenticated user')

    const entryType: EntryType = parsed.direction === 'credit' ? 'adjustment_credit' : 'adjustment_debit'
    const entryId = randomUUID()

    const entry = await de.createOrmEntity({
      entity: DealerLedgerEntry,
      data: {
        id: entryId,
        dealerProfileId: parsed.dealerProfileId,
        tenantId: scope.tenantId,
        entryType,
        amount: String(parsed.amount),
        currencyCode: DEFAULT_CURRENCY_CODE,
        direction: ENTRY_TYPE_DIRECTION[entryType],
        referenceType: 'adjustment',
        referenceId: entryId,
        note: parsed.note,
        createdBy: String(userId),
      },
    })

    await eventsConfig.emit('payouts.ledger_entry_created', {
      id: entry.id,
      dealerProfileId: entry.dealerProfileId,
      tenantId: scope.tenantId,
      entryType: entry.entryType,
      amount: parsed.amount,
      direction: entry.direction,
    })

    return entry
  },
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
