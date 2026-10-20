import type { FilterQuery } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { badRequest, notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { DealerProfile } from '@/modules/dealer_onboarding/data/entities'

export type DealerOrdersScope = { tenantId: string; organizationId: string }

export type SystemScopeInput = {
  tenantId?: unknown
  organizationId?: unknown
}

function readUuid(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function resolveCommandScope(ctx: CommandRuntimeContext, input?: SystemScopeInput | null): DealerOrdersScope {
  const systemTenantId = ctx.systemActor === true ? readUuid(input?.tenantId) : null
  const systemOrganizationId = ctx.systemActor === true ? readUuid(input?.organizationId) : null

  const tenantId = ctx.auth?.tenantId ?? systemTenantId ?? null
  if (!tenantId) throw badRequest('[internal] dealer_orders command requires a tenant scope')

  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? systemOrganizationId ?? null
  if (!organizationId) throw badRequest('[internal] dealer_orders command requires an organization scope')

  ensureTenantScope(ctx, tenantId)
  ensureOrganizationScope(ctx, organizationId)
  return { tenantId, organizationId }
}

export function resolveUndoScope(
  ctx: CommandRuntimeContext,
  snapshot: { tenantId: string; organizationId: string },
): DealerOrdersScope {
  ensureTenantScope(ctx, snapshot.tenantId)
  ensureOrganizationScope(ctx, snapshot.organizationId)
  return { tenantId: snapshot.tenantId, organizationId: snapshot.organizationId }
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Derive the calling dealer's own `dealerProfileId` from their authenticated
 * tenant + organization scope — never from a caller-supplied value. Fails
 * closed (404) when no profile exists for this org, or when it exists but
 * isn't `approved` (pending/rejected dealers, and staff of a pending/rejected
 * dealer, cannot reach any order data).
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
      translate('dealer_orders.errors.dealerNotFound', 'No approved dealer profile for this organization'),
    )
  }
  return String(profile.id)
}
