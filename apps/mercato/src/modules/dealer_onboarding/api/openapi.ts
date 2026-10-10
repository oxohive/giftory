import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerRegisterSchema, dealerDocumentUploadSchema, dealerResubmitSchema, adminApplicationsListSchema } from '../data/validators'
import { DEALER_KYC_STATUSES, DEALER_BUSINESS_TYPES, DEALER_DOCUMENT_TYPES } from '../lib/constants'

export const dealerTag = 'Dealer Onboarding'
export const adminDealerTag = 'Admin — Dealer Applications'

// ---------------------------------------------------------------------------
// Shared wire schemas
// ---------------------------------------------------------------------------

export const dealerProfileWireSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  businessName: z.string(),
  contactEmail: z.string().email(),
  phone: z.string(),
  businessType: z.enum(DEALER_BUSINESS_TYPES),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  kycStatus: z.enum(DEALER_KYC_STATUSES),
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const dealerDocumentWireSchema = z.object({
  id: z.string().uuid(),
  dealerProfileId: z.string().uuid(),
  documentType: z.enum(DEALER_DOCUMENT_TYPES),
  fileName: z.string(),
  fileSizeBytes: z.number().int(),
  mimeType: z.string(),
  uploadedAt: z.string(),
})

export const registerRequestSchema = dealerRegisterSchema.extend({
  organizationId: z.string().uuid().describe('Marketplace organization ID — used to resolve the platform tenant'),
})

export const registerResponseSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
})

export const statusResponseSchema = dealerProfileWireSchema.extend({
  documents: z.array(dealerDocumentWireSchema),
})

export const documentUploadResponseSchema = z.object({
  id: z.string().uuid(),
  documentType: z.string(),
  fileName: z.string(),
})

export const adminApplicationDetailSchema = dealerProfileWireSchema.extend({
  gstin: z.string().nullable(),
  pan: z.string().nullable(),
  documents: z.array(dealerDocumentWireSchema),
})

export const adminApplicationsListResponseSchema = z.object({
  items: z.array(dealerProfileWireSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export const resubmitResponseSchema = z.object({ ok: z.boolean() })
export const approveResponseSchema = z.object({ ok: z.boolean() })
export const rejectResponseSchema = z.object({ ok: z.boolean() })

export function commonDealerErrors(): OpenApiRouteDoc['methods'][string]['errors'] {
  return [
    { status: 422, description: 'Validation error' },
    { status: 409, description: 'Conflict — email already registered' },
    { status: 429, description: 'Rate limited' },
  ]
}

export function commonAdminErrors(): OpenApiRouteDoc['methods'][string]['errors'] {
  return [
    { status: 401, description: 'Authentication required' },
    { status: 403, description: 'Insufficient permissions' },
    { status: 404, description: 'Application not found' },
    { status: 422, description: 'Validation error' },
  ]
}
