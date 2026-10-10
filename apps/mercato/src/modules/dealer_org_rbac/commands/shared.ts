import type { FilterQuery } from '@mikro-orm/postgresql'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerCapability } from '../data/entities'
import type { DealerProfile } from '../../dealer_onboarding/data/entities'

export async function findCapabilityByProfile(
  em: import('@mikro-orm/postgresql').EntityManager,
  dealerProfileId: string,
  tenantId: string,
): Promise<DealerCapability | null> {
  return em.findOne(DealerCapability, {
    dealerProfileId,
    tenantId,
    deletedAt: null,
  } as FilterQuery<DealerCapability>)
}

export async function findProfileById(
  em: import('@mikro-orm/postgresql').EntityManager,
  id: string,
  tenantId: string,
): Promise<DealerProfile> {
  const { DealerProfile } = await import('../../dealer_onboarding/data/entities')
  const { translate } = await resolveTranslations()
  const profile = await em.findOne(DealerProfile, {
    id,
    tenantId,
    deletedAt: null,
  } as FilterQuery<DealerProfile>)
  if (!profile) throw notFound(translate('dealer_org.errors.dealerNotFound', 'Dealer not found'))
  return profile
}

export async function findOwnProfile(
  em: import('@mikro-orm/postgresql').EntityManager,
  organizationId: string,
  tenantId: string,
): Promise<DealerProfile> {
  const { DealerProfile } = await import('../../dealer_onboarding/data/entities')
  const { translate } = await resolveTranslations()
  const profile = await em.findOne(DealerProfile, {
    organizationId,
    tenantId,
    kycStatus: 'approved',
    deletedAt: null,
  } as FilterQuery<DealerProfile>)
  if (!profile) throw notFound(translate('dealer_org.errors.dealerNotFound', 'Dealer not found'))
  return profile
}

export function serializeCapabilities(cap: DealerCapability | null) {
  if (!cap) {
    return {
      productTypeCodes: [],
      printingMethods: [],
      maxDailyCapacity: 0,
      serviceableStates: [],
      minOrderQty: 1,
      updatedAt: null,
    }
  }
  return {
    id: cap.id,
    productTypeCodes: cap.productTypeCodes,
    printingMethods: cap.printingMethods,
    maxDailyCapacity: cap.maxDailyCapacity,
    serviceableStates: cap.serviceableStates,
    minOrderQty: cap.minOrderQty,
    updatedAt: cap.updatedAt.toISOString(),
  }
}
