import type { FilterQuery } from '@mikro-orm/postgresql'
import type { AuthContext } from '@open-mercato/shared/lib/auth/server'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CommandRuntimeContext, CommandBus } from '@open-mercato/shared/lib/commands'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { DealerProfile, DealerKycDocument } from '../data/entities'

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

// ---------------------------------------------------------------------------
// KYC document file access — shared by the dealer-side and admin-side
// download routes. Both resolve the owning DealerProfile first (session-
// derived for the dealer route, tenant-scoped-by-path for the admin route —
// mirroring the existing application-detail route's trust boundary) and then
// re-check the requested document actually belongs to THAT profile. A
// document id that belongs to a different dealer therefore never resolves,
// regardless of the caller's feature grants: the 404 happens before any
// attachment storage read is attempted.
// ---------------------------------------------------------------------------

export type DealerDocumentLookup = { profile: DealerProfile; document: DealerKycDocument }

/** Dealer-side: resolve one of the CALLER'S OWN KYC documents by id. */
export async function loadOwnDealerDocument(
  em: import('@mikro-orm/postgresql').EntityManager,
  organizationId: string,
  tenantId: string,
  documentId: string,
): Promise<DealerDocumentLookup> {
  const { translate } = await resolveTranslations()
  const profile = await findOwnProfile(em, organizationId, tenantId)
  const document = await em.findOne(DealerKycDocument, {
    id: documentId,
    dealerProfileId: profile.id,
    tenantId,
    deletedAt: null,
  } as FilterQuery<DealerKycDocument>)
  if (!document) throw notFound(translate('dealer_onboarding.errors.documentNotFound', 'Document not found'))
  return { profile, document }
}

/**
 * Admin-side: resolve a KYC document belonging to a specific application
 * (`applicationId` = DealerProfile id), scoped to the caller's tenant only —
 * same tenant-only trust boundary as the existing admin application-detail
 * route, never the admin's own organization.
 */
export async function loadDealerDocumentForReview(
  em: import('@mikro-orm/postgresql').EntityManager,
  tenantId: string,
  applicationId: string,
  documentId: string,
): Promise<DealerDocumentLookup> {
  const { translate } = await resolveTranslations()
  const profile = await findProfileById(em, applicationId, tenantId)
  const document = await em.findOne(DealerKycDocument, {
    id: documentId,
    dealerProfileId: profile.id,
    tenantId,
    deletedAt: null,
  } as FilterQuery<DealerKycDocument>)
  if (!document) throw notFound(translate('dealer_onboarding.errors.documentNotFound', 'Document not found'))
  return { profile, document }
}

/**
 * Builds the auth context used for the one `attachmentService.readScoped`
 * call a reviewer makes: the attachment is scoped to the DEALER's
 * tenant+organization, not the reviewing admin's own, so the read must be
 * made with that scope. Switching `orgId` here is safe only because the
 * caller already resolved `profile` via `loadDealerDocumentForReview`,
 * which re-checked both the tenant boundary and the document-to-application
 * link before this function is ever called — it grants nothing beyond the
 * one document that lookup already authorized.
 */
export function buildReviewerAttachmentAuth(auth: NonNullable<AuthContext>, profile: DealerProfile): NonNullable<AuthContext> {
  return { ...auth, tenantId: profile.tenantId, orgId: profile.organizationId }
}
