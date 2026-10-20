import type { FilterQuery } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { badRequest, notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CommissionRule, OrderCommissionSnapshot } from '../data/entities'
import type { DealerProfile } from '@/modules/dealer_onboarding/data/entities'

export type CommissionScope = { tenantId: string; organizationId: string }

export function resolveCommandScope(ctx: CommandRuntimeContext, input?: { tenantId?: unknown; organizationId?: unknown } | null): CommissionScope {
  const systemTenantId = ctx.systemActor === true && typeof input?.tenantId === 'string' ? input.tenantId : null
  const systemOrganizationId = ctx.systemActor === true && typeof input?.organizationId === 'string' ? input.organizationId : null

  const tenantId = ctx.auth?.tenantId ?? systemTenantId ?? null
  if (!tenantId) throw badRequest('[internal] commissions command requires a tenant scope')

  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? systemOrganizationId ?? null
  if (!organizationId) throw badRequest('[internal] commissions command requires an organization scope')

  ensureTenantScope(ctx, tenantId)
  return { tenantId, organizationId }
}

export type SerializedCommissionRule = {
  id: string
  tenantId: string
  dealerProfileId: string | null
  productTypeCode: string | null
  rateBps: number
  effectiveFrom: string
  effectiveTo: string | null
  createdBy: string
  createdAt: string
}

export function serializeCommissionRule(r: CommissionRule): SerializedCommissionRule {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    dealerProfileId: r.dealerProfileId ?? null,
    productTypeCode: r.productTypeCode ?? null,
    rateBps: r.rateBps,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo ?? null,
    createdBy: String(r.createdBy),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }
}

export type SerializedCommissionSnapshot = {
  id: string
  assignmentId: string
  orderId: string
  dealerProfileId: string
  tenantId: string
  subtotalAmount: number
  currencyCode: string
  commissionRateBps: number
  commissionAmount: number
  ruleId: string | null
  snapshottedAt: string
}

export function serializeCommissionSnapshot(s: OrderCommissionSnapshot): SerializedCommissionSnapshot {
  return {
    id: String(s.id),
    assignmentId: String(s.assignmentId),
    orderId: String(s.orderId),
    dealerProfileId: String(s.dealerProfileId),
    tenantId: String(s.tenantId),
    subtotalAmount: s.subtotalAmount,
    currencyCode: s.currencyCode,
    commissionRateBps: s.commissionRateBps,
    commissionAmount: s.commissionAmount,
    ruleId: s.ruleId ?? null,
    snapshottedAt: s.snapshottedAt instanceof Date ? s.snapshottedAt.toISOString() : String(s.snapshottedAt),
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
      translate('commissions.errors.dealerNotFound', 'No approved dealer profile for this organization'),
    )
  }
  return String(profile.id)
}
