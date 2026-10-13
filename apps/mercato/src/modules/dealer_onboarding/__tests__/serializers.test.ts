import { describe, expect, it } from '@jest/globals'
import { serializeDealerProfile } from '../commands/register'
import { serializeDealerDocument } from '../commands/documents'
import type { DealerProfile } from '../data/entities'
import type { DealerKycDocument } from '../data/entities'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-11T10:00:00.000Z')
const LATER = new Date('2026-10-11T12:00:00.000Z')

function makeProfile(overrides: Partial<DealerProfile> = {}): DealerProfile {
  return {
    id: 'profile-uuid-1',
    organizationId: 'org-uuid-1',
    tenantId: 'tenant-uuid-1',
    businessName: 'Acme Gifts',
    contactEmail: 'owner@acmegifts.in',
    phone: '+91 98765 43210',
    gstin: '22AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    businessType: 'pvt_ltd',
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
    kycStatus: 'pending_verification',
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    approvedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  } as DealerProfile
}

function makeDocument(overrides: Partial<DealerKycDocument> = {}): DealerKycDocument {
  return {
    id: 'doc-uuid-1',
    dealerProfileId: 'profile-uuid-1',
    tenantId: 'tenant-uuid-1',
    documentType: 'gst_certificate',
    storageKey: 'kyc/tenant-1/gst.pdf',
    fileName: 'gst_certificate.pdf',
    fileSizeBytes: 102_400,
    mimeType: 'application/pdf',
    uploadedAt: NOW,
    deletedAt: null,
    ...overrides,
  } as DealerKycDocument
}

// ---------------------------------------------------------------------------
// serializeDealerProfile
// ---------------------------------------------------------------------------

describe('serializeDealerProfile', () => {
  it('serializes all scalar fields correctly', () => {
    const profile = makeProfile()
    const result = serializeDealerProfile(profile)

    expect(result.id).toBe('profile-uuid-1')
    expect(result.organizationId).toBe('org-uuid-1')
    expect(result.tenantId).toBe('tenant-uuid-1')
    expect(result.businessName).toBe('Acme Gifts')
    expect(result.contactEmail).toBe('owner@acmegifts.in')
    expect(result.phone).toBe('+91 98765 43210')
    expect(result.businessType).toBe('pvt_ltd')
    expect(result.city).toBe('Mumbai')
    expect(result.state).toBe('MH')
    expect(result.pincode).toBe('400001')
    expect(result.kycStatus).toBe('pending_verification')
  })

  it('converts Date fields to ISO strings', () => {
    const profile = makeProfile({ createdAt: NOW, updatedAt: LATER })
    const result = serializeDealerProfile(profile)
    expect(result.createdAt).toBe('2026-10-11T10:00:00.000Z')
    expect(result.updatedAt).toBe('2026-10-11T12:00:00.000Z')
  })

  it('serializes approvedAt when set', () => {
    const profile = makeProfile({ kycStatus: 'approved', approvedAt: LATER })
    const result = serializeDealerProfile(profile)
    expect(result.approvedAt).toBe('2026-10-11T12:00:00.000Z')
  })

  it('returns null for optional date fields when absent', () => {
    const profile = makeProfile({ reviewedAt: null, approvedAt: null })
    const result = serializeDealerProfile(profile)
    expect(result.reviewedAt).toBeNull()
    expect(result.approvedAt).toBeNull()
  })

  it('returns null for rejectionReason when absent', () => {
    const result = serializeDealerProfile(makeProfile())
    expect(result.rejectionReason).toBeNull()
  })

  it('includes rejectionReason when set', () => {
    const profile = makeProfile({ kycStatus: 'rejected', rejectionReason: 'Documents are blurry' })
    expect(serializeDealerProfile(profile).rejectionReason).toBe('Documents are blurry')
  })

  it('does NOT include gstin or pan (those are admin-only)', () => {
    const result = serializeDealerProfile(makeProfile()) as Record<string, unknown>
    expect(result.gstin).toBeUndefined()
    expect(result.pan).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// serializeDealerDocument
// ---------------------------------------------------------------------------

describe('serializeDealerDocument', () => {
  it('serializes all fields correctly', () => {
    const doc = makeDocument()
    const result = serializeDealerDocument(doc)

    expect(result.id).toBe('doc-uuid-1')
    expect(result.dealerProfileId).toBe('profile-uuid-1')
    expect(result.tenantId).toBe('tenant-uuid-1')
    expect(result.documentType).toBe('gst_certificate')
    expect(result.storageKey).toBe('kyc/tenant-1/gst.pdf')
    expect(result.fileName).toBe('gst_certificate.pdf')
    expect(result.fileSizeBytes).toBe(102_400)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('converts uploadedAt to ISO string', () => {
    const result = serializeDealerDocument(makeDocument({ uploadedAt: NOW }))
    expect(result.uploadedAt).toBe('2026-10-11T10:00:00.000Z')
  })

  it('returns null for uploadedAt when absent', () => {
    const result = serializeDealerDocument(makeDocument({ uploadedAt: undefined as unknown as Date }))
    expect(result.uploadedAt).toBeNull()
  })
})
