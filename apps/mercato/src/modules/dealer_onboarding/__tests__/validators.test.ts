import { describe, expect, it } from '@jest/globals'
import {
  dealerRegisterSchema,
  dealerDocumentUploadSchema,
  dealerResubmitSchema,
  adminRejectSchema,
  adminApplicationsListSchema,
} from '../data/validators'
import { DEALER_BUSINESS_TYPES, DEALER_DOCUMENT_TYPES, DEALER_KYC_STATUSES, MAX_DOCUMENT_SIZE_BYTES } from '../lib/constants'

const VALID_UUID = 'a1b2c3d4-e5f6-4789-8abc-def012345678'

// ---------------------------------------------------------------------------
// Valid base fixture
// ---------------------------------------------------------------------------

const validRegistration = {
  businessName: 'Acme Gifts Pvt Ltd',
  contactEmail: 'owner@acmegifts.in',
  phone: '+91 98765 43210',
  gstin: '22AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  businessType: 'pvt_ltd' as const,
  city: 'Mumbai',
  state: 'MH',
  pincode: '400001',
}

// ---------------------------------------------------------------------------
// dealerRegisterSchema
// ---------------------------------------------------------------------------

describe('dealerRegisterSchema', () => {
  it('accepts a valid registration payload', () => {
    const result = dealerRegisterSchema.safeParse(validRegistration)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.businessName).toBe('Acme Gifts Pvt Ltd')
    }
  })

  it('normalises GSTIN and PAN to uppercase', () => {
    const result = dealerRegisterSchema.safeParse({ ...validRegistration, gstin: '22aaaaa0000a1z5', pan: 'aaaaa0000a' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.gstin).toBe('22AAAAA0000A1Z5')
      expect(result.data.pan).toBe('AAAAA0000A')
    }
  })

  it('strips leading/trailing whitespace from businessName', () => {
    const result = dealerRegisterSchema.safeParse({ ...validRegistration, businessName: '  Acme  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.businessName).toBe('Acme')
  })

  it('rejects an invalid GSTIN', () => {
    const cases = ['INVALID', '22AAAA0000A1Z5', '99AAAAA0000A1Z', '0AAAAA0000A1Z5']
    for (const gstin of cases) {
      expect(dealerRegisterSchema.safeParse({ ...validRegistration, gstin }).success).toBe(false)
    }
  })

  it('rejects an invalid PAN', () => {
    const cases = ['ABCDE123', 'ABCDE12345', '1BCDE1234F', 'ABCDE1234']
    for (const pan of cases) {
      expect(dealerRegisterSchema.safeParse({ ...validRegistration, pan }).success).toBe(false)
    }
  })

  it('rejects a non-Indian phone format', () => {
    expect(dealerRegisterSchema.safeParse({ ...validRegistration, phone: 'not-a-phone' }).success).toBe(false)
  })

  it('rejects an invalid email', () => {
    expect(dealerRegisterSchema.safeParse({ ...validRegistration, contactEmail: 'notanemail' }).success).toBe(false)
  })

  it('rejects a businessName under 2 characters', () => {
    expect(dealerRegisterSchema.safeParse({ ...validRegistration, businessName: 'A' }).success).toBe(false)
  })

  it('rejects unknown businessType', () => {
    expect(dealerRegisterSchema.safeParse({ ...validRegistration, businessType: 'sole_trader' }).success).toBe(false)
  })

  it('accepts all known businessType values', () => {
    for (const businessType of DEALER_BUSINESS_TYPES) {
      expect(dealerRegisterSchema.safeParse({ ...validRegistration, businessType }).success).toBe(true)
    }
  })

  it('rejects a non-6-digit pincode', () => {
    expect(dealerRegisterSchema.safeParse({ ...validRegistration, pincode: '12345' }).success).toBe(false)
    expect(dealerRegisterSchema.safeParse({ ...validRegistration, pincode: '1234567' }).success).toBe(false)
    expect(dealerRegisterSchema.safeParse({ ...validRegistration, pincode: 'ABCDEF' }).success).toBe(false)
  })

  it('rejects a state code with digits', () => {
    expect(dealerRegisterSchema.safeParse({ ...validRegistration, state: 'M1' }).success).toBe(false)
  })

  it('strips tenantId and organizationId from output (no passthrough)', () => {
    const result = dealerRegisterSchema.safeParse({
      ...validRegistration,
      tenantId: VALID_UUID,
      organizationId: VALID_UUID,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).tenantId).toBeUndefined()
      expect((result.data as Record<string, unknown>).organizationId).toBeUndefined()
    }
  })

  it('rejects missing required fields', () => {
    const { businessName: _omit, ...withoutName } = validRegistration
    expect(dealerRegisterSchema.safeParse(withoutName).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// dealerDocumentUploadSchema
// ---------------------------------------------------------------------------

const validDocument = {
  documentType: 'gst_certificate' as const,
  storageKey: 'kyc/tenant-1/org-1/gst_certificate.pdf',
  fileName: 'gst_certificate.pdf',
  fileSizeBytes: 512_000,
  mimeType: 'application/pdf',
}

describe('dealerDocumentUploadSchema', () => {
  it('accepts a valid document upload payload', () => {
    expect(dealerDocumentUploadSchema.safeParse(validDocument).success).toBe(true)
  })

  it('accepts all known documentType values', () => {
    for (const documentType of DEALER_DOCUMENT_TYPES) {
      expect(dealerDocumentUploadSchema.safeParse({ ...validDocument, documentType }).success).toBe(true)
    }
  })

  it('rejects unknown documentType', () => {
    expect(dealerDocumentUploadSchema.safeParse({ ...validDocument, documentType: 'bank_statement' }).success).toBe(false)
  })

  it('accepts image mime types', () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'image/webp', 'image/tiff']) {
      expect(dealerDocumentUploadSchema.safeParse({ ...validDocument, mimeType }).success).toBe(true)
    }
  })

  it('rejects unsupported mime types', () => {
    for (const mimeType of ['image/gif', 'text/plain', 'application/zip', 'video/mp4']) {
      expect(dealerDocumentUploadSchema.safeParse({ ...validDocument, mimeType }).success).toBe(false)
    }
  })

  it('rejects file size above 10 MB', () => {
    expect(dealerDocumentUploadSchema.safeParse({ ...validDocument, fileSizeBytes: MAX_DOCUMENT_SIZE_BYTES + 1 }).success).toBe(false)
  })

  it('rejects zero-byte files', () => {
    expect(dealerDocumentUploadSchema.safeParse({ ...validDocument, fileSizeBytes: 0 }).success).toBe(false)
  })

  it('coerces fileSizeBytes from a string', () => {
    const result = dealerDocumentUploadSchema.safeParse({ ...validDocument, fileSizeBytes: '102400' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.fileSizeBytes).toBe(102_400)
  })
})

// ---------------------------------------------------------------------------
// dealerResubmitSchema
// ---------------------------------------------------------------------------

describe('dealerResubmitSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(dealerResubmitSchema.safeParse({}).success).toBe(true)
  })

  it('accepts a partial update with just businessName', () => {
    expect(dealerResubmitSchema.safeParse({ businessName: 'New Name Ltd' }).success).toBe(true)
  })

  it('validates gstin when provided', () => {
    expect(dealerResubmitSchema.safeParse({ gstin: 'INVALID' }).success).toBe(false)
    expect(dealerResubmitSchema.safeParse({ gstin: '22AAAAA0000A1Z5' }).success).toBe(true)
  })

  it('validates pan when provided', () => {
    expect(dealerResubmitSchema.safeParse({ pan: 'BAD' }).success).toBe(false)
    expect(dealerResubmitSchema.safeParse({ pan: 'AAAAA0000A' }).success).toBe(true)
  })

  it('accepts a note up to 2000 characters', () => {
    expect(dealerResubmitSchema.safeParse({ note: 'x'.repeat(2000) }).success).toBe(true)
    expect(dealerResubmitSchema.safeParse({ note: 'x'.repeat(2001) }).success).toBe(false)
  })

  it('transforms empty string note to null', () => {
    const result = dealerResubmitSchema.safeParse({ note: '   ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.note).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// adminRejectSchema
// ---------------------------------------------------------------------------

describe('adminRejectSchema', () => {
  it('accepts a valid id and reason', () => {
    expect(adminRejectSchema.safeParse({ id: VALID_UUID, reason: 'Documents unclear' }).success).toBe(true)
  })

  it('rejects empty reason', () => {
    expect(adminRejectSchema.safeParse({ id: VALID_UUID, reason: '' }).success).toBe(false)
    expect(adminRejectSchema.safeParse({ id: VALID_UUID, reason: '   ' }).success).toBe(false)
  })

  it('rejects reason over 2000 characters', () => {
    expect(adminRejectSchema.safeParse({ id: VALID_UUID, reason: 'x'.repeat(2001) }).success).toBe(false)
  })

  it('rejects invalid UUID', () => {
    expect(adminRejectSchema.safeParse({ id: 'not-a-uuid', reason: 'reason' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// adminApplicationsListSchema
// ---------------------------------------------------------------------------

describe('adminApplicationsListSchema', () => {
  it('applies default pagination', () => {
    const result = adminApplicationsListSchema.parse({})
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(50)
    expect(result.sortField).toBe('created_at')
    expect(result.sortDir).toBe('desc')
  })

  it('coerces string numbers', () => {
    const result = adminApplicationsListSchema.parse({ page: '3', pageSize: '10' })
    expect(result.page).toBe(3)
    expect(result.pageSize).toBe(10)
  })

  it('rejects pageSize above 100', () => {
    expect(adminApplicationsListSchema.safeParse({ pageSize: '101' }).success).toBe(false)
  })

  it('filters by valid kycStatus', () => {
    for (const kycStatus of DEALER_KYC_STATUSES) {
      expect(adminApplicationsListSchema.safeParse({ kycStatus }).success).toBe(true)
    }
  })

  it('rejects an unknown kycStatus', () => {
    expect(adminApplicationsListSchema.safeParse({ kycStatus: 'processing' }).success).toBe(false)
  })
})
