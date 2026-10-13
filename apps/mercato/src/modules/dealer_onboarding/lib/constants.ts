export const DEALER_KYC_STATUSES = [
  'pending_verification',
  'under_review',
  'approved',
  'rejected',
] as const

export type DealerKycStatus = (typeof DEALER_KYC_STATUSES)[number]

export const DEALER_BUSINESS_TYPES = ['proprietorship', 'partnership', 'pvt_ltd', 'llp'] as const

export type DealerBusinessType = (typeof DEALER_BUSINESS_TYPES)[number]

export const DEALER_DOCUMENT_TYPES = ['gst_certificate', 'pan_card', 'address_proof'] as const

export type DealerDocumentType = (typeof DEALER_DOCUMENT_TYPES)[number]

/** Max document file size: 10 MB in bytes (enforced client-side; stored for reference). */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024

export const DEALER_PROFILE_ENTITY_ID = 'dealer_onboarding:dealer_profile' as const
export const DEALER_DOCUMENT_ENTITY_ID = 'dealer_onboarding:dealer_kyc_document' as const

/**
 * Storage partition for KYC documents. Reuses the attachments module's
 * default private partition (never public) rather than declaring a new one —
 * `privateAttachments` is already seeded by `ensureDefaultPartitions` and is
 * tenant/organization scoped per upload. See `commands/documents.ts`.
 */
export const DEALER_DOCUMENT_ATTACHMENT_PARTITION = 'privateAttachments' as const

export const DEALER_PROFILE_RESOURCE_KIND = 'dealer_onboarding.dealer_profile' as const
export const DEALER_DOCUMENT_RESOURCE_KIND = 'dealer_onboarding.dealer_kyc_document' as const

export const DEALER_REGISTER_COMMAND = 'dealer_onboarding.profiles.register' as const
export const DEALER_UPLOAD_DOCUMENT_COMMAND = 'dealer_onboarding.documents.upload' as const
export const DEALER_APPROVE_COMMAND = 'dealer_onboarding.profiles.approve' as const
export const DEALER_REJECT_COMMAND = 'dealer_onboarding.profiles.reject' as const
export const DEALER_RESUBMIT_COMMAND = 'dealer_onboarding.profiles.resubmit' as const

/** Roles created for dealer users. Scoped to their org via role_acls.organizations_json at approval. */
export const DEALER_OWNER_ROLE = 'dealer:owner' as const
export const DEALER_STAFF_ROLE = 'dealer:staff' as const

/**
 * Features that must be present on `dealer:owner`'s RoleAcl once a dealer in
 * the tenant is approved. `dealer:owner` is a single, tenant-wide role shared
 * by every dealer owner in the tenant (ADR-003) — these features are MERGED
 * into the role's existing `featuresJson` at approval time, never used to
 * replace it (see `scopeDealerRoleToOrg` in commands/review.ts). Includes the
 * `*.dealer_access` grants for dealer_orders/commissions/payouts so that an
 * approved dealer owner can actually reach their dealer-facing order,
 * earnings and ledger endpoints (those features are declared in each of
 * those modules' own acl.ts/setup.ts, but granting them here too — via the
 * same merge-safe write — heals any tenant whose dealer_orders/commissions/
 * payouts setup.ts grants haven't yet been (re)synced via
 * `yarn mercato auth sync-role-acls`).
 *
 * `dealer:staff`'s `dealer_orders.dealer_access` grant is NOT listed here —
 * staff's RoleAcl is never org-scoped by `scopeDealerRoleToOrg` (only
 * `dealer:owner`'s is), so staff's grant comes exclusively from
 * `dealer_orders/setup.ts`'s `defaultRoleFeatures`, applied at tenant
 * creation or via `sync-role-acls`. `commissions.dealer_access` and
 * `payouts.dealer_access` are intentionally owner-only (FEAT-009: staff
 * cannot access commission or payout data).
 */
export const DEALER_OWNER_APPROVAL_FEATURES = [
  'dealer_onboarding.view_own',
  'dealer_onboarding.submit',
  'dealer_orders.dealer_access',
  'commissions.dealer_access',
  'payouts.dealer_access',
] as const
