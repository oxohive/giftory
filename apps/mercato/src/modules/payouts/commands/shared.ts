import type { FilterQuery } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { badRequest, notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { DealerLedgerEntry } from '../data/entities'
import type { DealerProfile } from '@/modules/dealer_onboarding/data/entities'

export type PayoutsScope = { tenantId: string; organizationId: string }

export function resolveCommandScope(
  ctx: CommandRuntimeContext,
  input?: { tenantId?: unknown; organizationId?: unknown } | null,
): PayoutsScope {
  const systemTenantId = ctx.systemActor === true && typeof input?.tenantId === 'string' ? input.tenantId : null
  const systemOrganizationId =
    ctx.systemActor === true && typeof input?.organizationId === 'string' ? input.organizationId : null

  const tenantId = ctx.auth?.tenantId ?? systemTenantId ?? null
  if (!tenantId) throw badRequest('[internal] payouts command requires a tenant scope')

  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? systemOrganizationId ?? null
  if (!organizationId) throw badRequest('[internal] payouts command requires an organization scope')

  ensureTenantScope(ctx, tenantId)
  return { tenantId, organizationId }
}

export type SerializedLedgerEntry = {
  id: string
  dealerProfileId: string
  tenantId: string
  entryType: string
  amount: number
  currencyCode: string
  direction: string
  referenceType: string
  referenceId: string
  note: string | null
  createdBy: string
  createdAt: string
}

export function serializeLedgerEntry(e: DealerLedgerEntry): SerializedLedgerEntry {
  return {
    id: String(e.id),
    dealerProfileId: String(e.dealerProfileId),
    tenantId: String(e.tenantId),
    entryType: e.entryType,
    amount: parseInt(String(e.amount), 10),
    currencyCode: e.currencyCode,
    direction: e.direction,
    referenceType: e.referenceType,
    referenceId: String(e.referenceId),
    note: e.note ?? null,
    createdBy: String(e.createdBy),
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
  }
}

/**
 * Derive the calling dealer's own `dealerProfileId` from their authenticated
 * tenant + organization scope — never from a caller-supplied value. Fails
 * closed (404) when no profile exists for this org, or when it exists but
 * isn't `approved`.
 */
export async function resolveOwnDealerProfileId(
  em: import('@mikro-orm/postgresql').EntityManager,
  organizationId: string,
  tenantId: string,
): Promise<string> {
  const { DealerProfile } = await import('@/modules/dealer_onboarding/data/entities')
  const { translate } = await resolveTranslations()
  const profile = await em.findOne(DealerProfile, {
    organizationId,
    tenantId,
    kycStatus: 'approved',
    deletedAt: null,
  } as FilterQuery<DealerProfile>)
  if (!profile) {
    throw notFound(
      translate('payouts.errors.dealerNotFound', 'No approved dealer profile for this organization'),
    )
  }
  return String(profile.id)
}
