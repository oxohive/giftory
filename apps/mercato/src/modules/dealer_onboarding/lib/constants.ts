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

/**
 * Roles created for dealer users. `dealer:owner` is a SINGLE, tenant-wide role
 * shared by every dealer owner in the tenant (not one role per dealer org) —
 * isolation between dealers is enforced at the command/data layer (every
 * dealer-facing command scopes its query by the caller's own `auth.orgId`),
 * never by restricting this shared role's `RoleAcl.organizations_json`. A
 * prior version of the approval flow tried the latter (per ADR-003's
 * original text), but a role-level org allow-list doesn't fit flat sibling
 * orgs that must be added one at a time: the moment any dealer was approved,
 * every other still-pending dealer's own org fell outside the list and their
 * own self-service requests started 403ing. Feature grants for this role come
 * entirely from each module's own `setup.ts` `defaultRoleFeatures`, applied at
 * tenant creation (or via `yarn mercato auth sync-role-acls` for drift).
 */
export const DEALER_OWNER_ROLE = 'dealer:owner' as const
export const DEALER_STAFF_ROLE = 'dealer:staff' as const
