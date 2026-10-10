import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { OrderCommissionSnapshot } from '../data/entities.js'
import { COMMISSION_SNAPSHOT_CREATE_COMMAND, COMMISSION_SNAPSHOT_RESOURCE_KIND, DEFAULT_CURRENCY_CODE } from '../lib/constants.js'
import { resolveCommissionRate, computeCommissionAmount } from '../lib/rateResolver.js'
import { resolveCommandScope, serializeCommissionSnapshot } from './shared.js'
import eventsConfig from '../events.js'

const logger = createLogger('commissions').child({ component: 'snapshots' })

const systemScopeSchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

/**
 * Input is provided by the dealer_order.assigned subscriber, never from HTTP.
 * subtotalAmount is in INR paise (integer minor units).
 */
const snapshotCommandSchema = z
  .object({
    assignmentId: z.string().uuid(),
    orderId: z.string().uuid(),
    dealerProfileId: z.string().uuid(),
    subtotalAmount: z.number().int().nonnegative(),
    productTypeCode: z.string().nullable().optional(),
  })
  .and(systemScopeSchema)

const createSnapshotCommand: CommandHandler<Record<string, unknown>, OrderCommissionSnapshot> = {
  id: COMMISSION_SNAPSHOT_CREATE_COMMAND,
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = snapshotCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
    const em = ctx.container.resolve<EntityManager>('em')
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()

    if (!scope.tenantId) throw badRequest('[internal] commissions snapshot requires a tenant scope')

    const { rateBps, ruleId } = await resolveCommissionRate(
      em,
      scope.tenantId,
      parsed.dealerProfileId,
      parsed.productTypeCode ?? null,
    )

    if (rateBps === 0 && !ruleId) {
      logger.warn('No commission rule found for dealer', { dealerProfileId: parsed.dealerProfileId })
    }

    const commissionAmount = computeCommissionAmount(parsed.subtotalAmount, rateBps)

    const snapshot = await de.createOrmEntity({
      entity: OrderCommissionSnapshot,
      data: {
        assignmentId: parsed.assignmentId,
        orderId: parsed.orderId,
        dealerProfileId: parsed.dealerProfileId,
        tenantId: scope.tenantId,
        subtotalAmount: parsed.subtotalAmount,
        currencyCode: DEFAULT_CURRENCY_CODE,
        commissionRateBps: rateBps,
        commissionAmount,
        ruleId: ruleId ?? null,
      },
    })

    await eventsConfig.emit('commission.snapshot_created', {
      id: snapshot.id,
      assignmentId: snapshot.assignmentId,
      orderId: snapshot.orderId,
      dealerProfileId: snapshot.dealerProfileId,
      tenantId: scope.tenantId,
      commissionAmount,
      rateBps,
    })

    return snapshot
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('commissions.audit.createSnapshot', 'Create commission snapshot'),
      resourceKind: COMMISSION_SNAPSHOT_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.tenantId),
      snapshotAfter: serializeCommissionSnapshot(result),
    }
  },
}

registerCommand(createSnapshotCommand)
