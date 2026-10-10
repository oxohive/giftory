import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { notFound, badRequest } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CommissionRule } from '../data/entities.js'
import { commissionRuleCreateSchema, commissionRuleDeactivateSchema } from '../data/validators.js'
import {
  COMMISSION_RULE_CREATE_COMMAND,
  COMMISSION_RULE_DEACTIVATE_COMMAND,
  COMMISSION_RULE_RESOURCE_KIND,
} from '../lib/constants.js'
import { resolveCommandScope, serializeCommissionRule } from './shared.js'
import eventsConfig from '../events.js'
import type { FilterQuery } from '@mikro-orm/postgresql'

const systemScopeSchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

// ── Create rule ───────────────────────────────────────────────────────────────

const createRuleCommandSchema = commissionRuleCreateSchema.and(systemScopeSchema)

const createRuleCommand: CommandHandler<Record<string, unknown>, CommissionRule> = {
  id: COMMISSION_RULE_CREATE_COMMAND,
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = createRuleCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const userId = ctx.auth?.sub ?? null
    if (!userId) throw badRequest('[internal] commissions createRule requires an authenticated user')

    const rule = await de.createOrmEntity({
      entity: CommissionRule,
      data: {
        tenantId: scope.tenantId,
        dealerProfileId: parsed.dealerProfileId ?? null,
        productTypeCode: parsed.productTypeCode ?? null,
        rateBps: parsed.rateBps,
        effectiveFrom: parsed.effectiveFrom,
        effectiveTo: null,
        createdBy: userId,
      },
    })

    await eventsConfig.emit('commission.rule_created', {
      id: rule.id,
      tenantId: scope.tenantId,
      dealerProfileId: rule.dealerProfileId ?? null,
      productTypeCode: rule.productTypeCode ?? null,
      rateBps: rule.rateBps,
    })

    return rule
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('commissions.audit.createRule', 'Create commission rule'),
      resourceKind: COMMISSION_RULE_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: (result as unknown as { organizationId?: string }).organizationId ?? String(result.tenantId),
      snapshotAfter: serializeCommissionRule(result),
    }
  },
}

// ── Deactivate rule ───────────────────────────────────────────────────────────

const deactivateRuleCommandSchema = commissionRuleDeactivateSchema.and(systemScopeSchema)

const deactivateRuleCommand: CommandHandler<Record<string, unknown>, CommissionRule> = {
  id: COMMISSION_RULE_DEACTIVATE_COMMAND,
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = deactivateRuleCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
    const em = ctx.container.resolve<EntityManager>('em')
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()

    const rule = await em.findOne(CommissionRule, {
      id: parsed.id,
      tenantId: scope.tenantId,
    } as FilterQuery<CommissionRule>)
    if (!rule) throw notFound(translate('commissions.errors.ruleNotFound', 'Commission rule not found'))

    if (rule.effectiveTo !== null && rule.effectiveTo !== undefined) {
      throw badRequest(translate('commissions.errors.ruleAlreadyDeactivated', 'Commission rule is already deactivated'))
    }

    const today = new Date().toISOString().slice(0, 10)
    const updated = await de.updateOrmEntity({
      entity: CommissionRule,
      where: { id: parsed.id, tenantId: scope.tenantId } as FilterQuery<CommissionRule>,
      apply: (entity) => {
        entity.effectiveTo = today
      },
    })
    if (!updated) throw notFound(translate('commissions.errors.ruleNotFound', 'Commission rule not found'))

    await eventsConfig.emit('commission.rule_deactivated', {
      id: updated.id,
      tenantId: scope.tenantId,
      effectiveTo: today,
    })

    return updated
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('commissions.audit.deactivateRule', 'Deactivate commission rule'),
      resourceKind: COMMISSION_RULE_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: (result as unknown as { organizationId?: string }).organizationId ?? String(result.tenantId),
      snapshotAfter: serializeCommissionRule(result),
    }
  },
}

registerCommand(createRuleCommand)
registerCommand(deactivateRuleCommand)
