import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest, conflict } from '@open-mercato/shared/lib/crud/errors'
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

export async function executeCapabilitiesUpsert(
  rawInput: unknown,
  ctx: CommandRuntimeContext,
): Promise<ReturnType<typeof serializeCapabilities>> {
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
    // Optimistic-concurrency check (repo convention): only enforced when the
    // caller actually sends `updatedAt` — an older client that never fetched
    // it keeps today's last-write-wins behavior; a client built against this
    // version gets a real 409 instead of silently clobbering a concurrent
    // edit (e.g. the owner and a staff session both editing capabilities).
    if (parsed.updatedAt !== undefined && existing.updatedAt.toISOString() !== parsed.updatedAt) {
      throw conflict(translate('dealer_org.errors.capabilitiesVersionMismatch', 'Capabilities were updated by someone else; reload and try again'))
    }
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
}

const command: CommandHandler<Record<string, unknown>, ReturnType<typeof serializeCapabilities>> = {
  id: DEALER_CAPABILITIES_UPSERT_COMMAND,
  execute: executeCapabilitiesUpsert,
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
