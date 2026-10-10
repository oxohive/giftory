import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerCapability } from '../data/entities'
import { capabilitiesUpsertSchema } from '../data/validators'
import { DEALER_CAPABILITIES_UPSERT_COMMAND } from '../lib/constants'
import { findOwnProfile, findProfileById, findCapabilityByProfile, serializeCapabilities } from './shared'

const commandInputSchema = capabilitiesUpsertSchema.extend({
  /** Present when called by dealer:owner updating their own capabilities. */
  organizationId: z.string().uuid().optional(),
  /** Present when called by admin updating a specific dealer by profile ID. */
  dealerProfileId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
})

const command: CommandHandler<Record<string, unknown>, ReturnType<typeof serializeCapabilities>> = {
  id: DEALER_CAPABILITIES_UPSERT_COMMAND,
  async execute(rawInput, ctx) {
    const parsed = commandInputSchema.parse(rawInput)
    const { translate } = await resolveTranslations()

    const tenantId = ctx.auth?.tenantId ?? parsed.tenantId ?? null
    if (!tenantId) throw badRequest(translate('dealer_org.errors.missingTenantScope', 'Missing tenant scope'))

    const em = ctx.container.resolve<EntityManager>('em')

    // Resolve the dealer profile — either from org scope (dealer self-service) or explicit ID (admin).
    let dealerProfileId: string
    if (parsed.dealerProfileId) {
      const profile = await findProfileById(em, parsed.dealerProfileId, tenantId)
      if (profile.kycStatus !== 'approved') {
        throw badRequest(translate('dealer_org.errors.dealerNotApproved', 'Dealer must be approved to set capabilities'))
      }
      dealerProfileId = profile.id
    } else {
      const orgId = ctx.auth?.orgId ?? parsed.organizationId ?? null
      if (!orgId) throw badRequest(translate('dealer_org.errors.missingOrgScope', 'Missing organization scope'))
      const profile = await findOwnProfile(em, orgId, tenantId)
      dealerProfileId = profile.id
    }

    const existing = await findCapabilityByProfile(em, dealerProfileId, tenantId)

    if (existing) {
      existing.productTypeCodes = parsed.productTypeCodes
      existing.printingMethods = parsed.printingMethods as string[]
      existing.maxDailyCapacity = parsed.maxDailyCapacity
      existing.serviceableStates = parsed.serviceableStates as string[]
      existing.minOrderQty = parsed.minOrderQty
      existing.updatedAt = new Date()
      await em.flush()
      return serializeCapabilities(existing)
    }

    const cap = em.create(DealerCapability, {
      dealerProfileId,
      tenantId,
      productTypeCodes: parsed.productTypeCodes,
      printingMethods: parsed.printingMethods as string[],
      maxDailyCapacity: parsed.maxDailyCapacity,
      serviceableStates: parsed.serviceableStates as string[],
      minOrderQty: parsed.minOrderQty,
    })
    await em.flush()
    return serializeCapabilities(cap)
  },
  buildLog: async ({ input, result }) => {
    const { translate } = await resolveTranslations()
    const inp = input as Record<string, unknown>
    return {
      actionLabel: translate('dealer_org.audit.upsertCapabilities', 'Update dealer capabilities'),
      resourceKind: 'dealer_org_rbac.dealer_capability',
      resourceId: String((result as { id?: string }).id ?? ''),
      tenantId: String(inp.tenantId ?? ''),
      organizationId: String(inp.organizationId ?? inp.dealerProfileId ?? ''),
      snapshotAfter: result as Record<string, unknown>,
    }
  },
}

registerCommand(command)
