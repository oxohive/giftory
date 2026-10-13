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
