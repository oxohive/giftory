import { z } from 'zod'
import { DEALER_BUSINESS_TYPES, DEALER_DOCUMENT_TYPES, DEALER_KYC_STATUSES, MAX_DOCUMENT_SIZE_BYTES } from '../lib/constants'

const uuid = () => z.string().uuid()

const trimmedText = (min: number, max: number) => z.string().trim().min(min).max(max)

const nullableTrimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null))

/**
 * India GSTIN: 15-character alphanumeric.
 * Pattern: 2-digit state code + 10-char PAN + 1-digit entity + 1 Z + 1 checksum.
 */
const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/, 'dealer_onboarding.validation.invalidGstin')

/**
 * India PAN: 10-character alphanumeric (AAAAA9999A format).
 */
const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'dealer_onboarding.validation.invalidPan')

/**
 * ISO 3166-2:IN state codes (two-letter suffix, e.g. "MH", "DL").
 */
const indianStateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,3}$/, 'dealer_onboarding.validation.invalidState')

const indianPincodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'dealer_onboarding.validation.invalidPincode')

// ---------------------------------------------------------------------------
// Dealer registration
// ---------------------------------------------------------------------------

/**
 * Schemas intentionally carry NO tenantId/organizationId: scope is resolved
 * server-side only. z.object strips unknown keys.
 */
export const dealerRegisterSchema = z.object({
  businessName: trimmedText(2, 200),
  contactEmail: z.string().trim().email().max(254),
  phone: z.string().trim().regex(/^\+?[0-9\s\-().]{7,20}$/, 'dealer_onboarding.validation.invalidPhone'),
  gstin: gstinSchema,
  pan: panSchema,
  businessType: z.enum(DEALER_BUSINESS_TYPES),
  city: trimmedText(1, 100),
  state: indianStateSchema,
  pincode: indianPincodeSchema,
})

export type DealerRegisterInput = z.infer<typeof dealerRegisterSchema>

// ---------------------------------------------------------------------------
// Document upload
// ---------------------------------------------------------------------------

export const dealerDocumentUploadSchema = z.object({
  documentType: z.enum(DEALER_DOCUMENT_TYPES),
  storageKey: trimmedText(1, 1024),
  fileName: trimmedText(1, 255),
  fileSizeBytes: z.coerce.number().int().min(1).max(MAX_DOCUMENT_SIZE_BYTES),
  mimeType: z
    .string()
    .trim()
    .regex(/^(application\/pdf|image\/(jpeg|png|webp|tiff))$/, 'dealer_onboarding.validation.unsupportedMimeType'),
})

export type DealerDocumentUploadInput = z.infer<typeof dealerDocumentUploadSchema>

// ---------------------------------------------------------------------------
// Resubmit
// ---------------------------------------------------------------------------

export const dealerResubmitSchema = z.object({
  businessName: trimmedText(2, 200).optional(),
  contactEmail: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().regex(/^\+?[0-9\s\-().]{7,20}$/, 'dealer_onboarding.validation.invalidPhone').optional(),
  gstin: gstinSchema.optional(),
  pan: panSchema.optional(),
  businessType: z.enum(DEALER_BUSINESS_TYPES).optional(),
  city: trimmedText(1, 100).optional(),
  state: indianStateSchema.optional(),
  pincode: indianPincodeSchema.optional(),
  note: nullableTrimmedText(2000),
})

export type DealerResubmitInput = z.infer<typeof dealerResubmitSchema>

// ---------------------------------------------------------------------------
// Admin: approve / reject
// ---------------------------------------------------------------------------

export const adminApproveSchema = z.object({
  id: uuid(),
})

export const adminRejectSchema = z.object({
  id: uuid(),
  reason: trimmedText(1, 2000),
})

export type AdminRejectInput = z.infer<typeof adminRejectSchema>

// ---------------------------------------------------------------------------
// List / query
// ---------------------------------------------------------------------------

export const adminApplicationsListSchema = z
  .object({
    kycStatus: z.enum(DEALER_KYC_STATUSES).optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    sortField: z.enum(['created_at', 'updated_at', 'business_name', 'kyc_status']).optional().default('created_at'),
    sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .passthrough()

export type AdminApplicationsListQuery = z.infer<typeof adminApplicationsListSchema>
