/**
 * Business-rule constants for the dealer registration/KYC screens, copied VERBATIM from the
 * real backend source so client-side validation never drifts from (or guesses at) what
 * `apps/mercato/src/modules/dealer_onboarding` actually enforces. Source, read directly for this
 * task:
 *   - apps/mercato/src/modules/dealer_onboarding/lib/constants.ts (business types, document
 *     types, max file size, document mime pattern)
 *   - apps/mercato/src/modules/dealer_onboarding/data/validators.ts (gstin/pan/state/pincode/
 *     phone regexes — reproduced in validators.ts, next to this file)
 *
 * If the backend changes these, this file must be updated to match — there is no automated
 * sync across the two apps (no shared package covers dealer_onboarding's domain rules).
 */

export const DEALER_BUSINESS_TYPES = ['proprietorship', 'partnership', 'pvt_ltd', 'llp'] as const
export type DealerBusinessType = (typeof DEALER_BUSINESS_TYPES)[number]

export const BUSINESS_TYPE_LABELS: Record<DealerBusinessType, string> = {
  proprietorship: 'Proprietorship',
  partnership: 'Partnership',
  pvt_ltd: 'Private Limited',
  llp: 'LLP',
}

export const DEALER_DOCUMENT_TYPES = ['gst_certificate', 'pan_card', 'address_proof'] as const
export type DealerDocumentType = (typeof DEALER_DOCUMENT_TYPES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DealerDocumentType, string> = {
  gst_certificate: 'GST Certificate',
  pan_card: 'PAN Card',
  address_proof: 'Address Proof',
}

export const DEALER_KYC_STATUSES = ['pending_verification', 'under_review', 'approved', 'rejected'] as const
export type DealerKycStatus = (typeof DEALER_KYC_STATUSES)[number]

/** 10 MB — `MAX_DOCUMENT_SIZE_BYTES` in the backend's lib/constants.ts. */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024

/** `DEALER_DOCUMENT_MIME_PATTERN` in the backend's data/validators.ts. */
export const DEALER_DOCUMENT_MIME_PATTERN = /^(application\/pdf|image\/(jpeg|png|webp|tiff))$/

/** Human-readable allowed-types copy for upload UI hints. */
export const DOCUMENT_ACCEPT_ATTR = 'application/pdf,image/jpeg,image/png,image/webp,image/tiff'
export const DOCUMENT_ACCEPT_LABEL = 'PDF, JPEG, PNG, WEBP or TIFF, up to 10 MB'

/**
 * ISO 3166-2:IN state/UT codes — a UX dropdown aid only. The backend's own `state` validator
 * (indianStateSchema) merely checks `^[A-Z]{2,3}$`, it does NOT enforce this exact list; a value
 * outside this list but matching that shape would still be accepted server-side. Offering a
 * curated list here is a usability improvement, not an added server-side constraint.
 */
export const INDIAN_STATE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'AN', label: 'Andaman and Nicobar Islands' },
  { code: 'AP', label: 'Andhra Pradesh' },
  { code: 'AR', label: 'Arunachal Pradesh' },
  { code: 'AS', label: 'Assam' },
  { code: 'BR', label: 'Bihar' },
  { code: 'CH', label: 'Chandigarh' },
  { code: 'CT', label: 'Chhattisgarh' },
  { code: 'DN', label: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: 'DL', label: 'Delhi' },
  { code: 'GA', label: 'Goa' },
  { code: 'GJ', label: 'Gujarat' },
  { code: 'HR', label: 'Haryana' },
  { code: 'HP', label: 'Himachal Pradesh' },
  { code: 'JK', label: 'Jammu and Kashmir' },
  { code: 'JH', label: 'Jharkhand' },
  { code: 'KA', label: 'Karnataka' },
  { code: 'KL', label: 'Kerala' },
  { code: 'LA', label: 'Ladakh' },
  { code: 'LD', label: 'Lakshadweep' },
  { code: 'MP', label: 'Madhya Pradesh' },
  { code: 'MH', label: 'Maharashtra' },
  { code: 'MN', label: 'Manipur' },
  { code: 'ML', label: 'Meghalaya' },
  { code: 'MZ', label: 'Mizoram' },
  { code: 'NL', label: 'Nagaland' },
  { code: 'OR', label: 'Odisha' },
  { code: 'PY', label: 'Puducherry' },
  { code: 'PB', label: 'Punjab' },
  { code: 'RJ', label: 'Rajasthan' },
  { code: 'SK', label: 'Sikkim' },
  { code: 'TN', label: 'Tamil Nadu' },
  { code: 'TG', label: 'Telangana' },
  { code: 'TR', label: 'Tripura' },
  { code: 'UP', label: 'Uttar Pradesh' },
  { code: 'UT', label: 'Uttarakhand' },
  { code: 'WB', label: 'West Bengal' },
]
