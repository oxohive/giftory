import type { FilterQuery } from '@mikro-orm/postgresql'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CommandRuntimeContext, CommandBus } from '@open-mercato/shared/lib/commands'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { DealerProfile } from '../data/entities'

export async function findOwnProfile(
  em: import('@mikro-orm/postgresql').EntityManager,
  organizationId: string,
  tenantId: string,
): Promise<DealerProfile> {
  const { translate } = await resolveTranslations()
  const profile = await em.findOne(DealerProfile, {
    organizationId,
    tenantId,
    deletedAt: null,
  } as FilterQuery<DealerProfile>)
  if (!profile) throw notFound(translate('dealer_onboarding.errors.profileNotFound', 'Dealer profile not found'))
  return profile
}

export async function findProfileById(
  em: import('@mikro-orm/postgresql').EntityManager,
  id: string,
  tenantId: string,
): Promise<DealerProfile> {
  const { translate } = await resolveTranslations()
  const profile = await em.findOne(DealerProfile, {
    id,
    tenantId,
    deletedAt: null,
  } as FilterQuery<DealerProfile>)
  if (!profile) throw notFound(translate('dealer_onboarding.errors.profileNotFound', 'Dealer profile not found'))
  return profile
}

export async function executeOmCommand<TResult>(
  container: AppContainer,
  commandId: string,
  input: Record<string, unknown>,
  ctx: CommandRuntimeContext,
): Promise<TResult> {
  const commandBus = container.resolve('commandBus') as CommandBus
  const { result } = await commandBus.execute<Record<string, unknown>, TResult>(commandId, { input, ctx })
  return result
}

export type SerializedDealerProfile = {
  id: string
  organizationId: string
  tenantId: string
  businessName: string
  contactEmail: string
  phone: string
  gstin: string | null
  pan: string | null
  businessType: string
  city: string
  state: string
  pincode: string
  kycStatus: string
  rejectionReason: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  approvedAt: string | null
  updatedAt: string | null
}

export function serializeDealerProfile(profile: DealerProfile): SerializedDealerProfile {
  return {
    id: String(profile.id),
    organizationId: String(profile.organizationId),
    tenantId: String(profile.tenantId),
    businessName: profile.businessName,
    contactEmail: profile.contactEmail,
    phone: profile.phone,
    gstin: profile.gstin ?? null,
    pan: profile.pan ?? null,
    businessType: profile.businessType,
    city: profile.city,
    state: profile.state,
    pincode: profile.pincode,
    kycStatus: profile.kycStatus,
    rejectionReason: profile.rejectionReason ?? null,
    reviewedBy: profile.reviewedBy ?? null,
    reviewedAt: toIso(profile.reviewedAt),
    approvedAt: toIso(profile.approvedAt),
    updatedAt: toIso(profile.updatedAt),
  }
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
