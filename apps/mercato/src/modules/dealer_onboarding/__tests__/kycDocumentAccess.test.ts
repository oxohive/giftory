import { describe, expect, it, jest } from '@jest/globals'
import type { DealerProfile, DealerKycDocument } from '../data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

import {
  loadOwnDealerDocument,
  loadDealerDocumentForReview,
  buildReviewerAttachmentAuth,
} from '../commands/shared'

/**
 * Proves KYC document privacy at the data-access boundary the two download
 * routes actually call (`api/dealer/onboarding/documents/[id]/file` and
 * `api/admin/dealers/applications/[id]/documents/[documentId]/file`).
 *
 * Rather than mocking the access decision itself, this test drives a tiny
 * in-memory fake `EntityManager` that filters a fixture dataset the same way
 * a real Postgres `WHERE` clause would — two dealers (A and B) in the SAME
 * tenant, each with their own KYC document, plus a dealer in a DIFFERENT
 * tenant — so a cross-dealer or cross-tenant document id genuinely cannot
 * resolve, not merely "the mock wasn't called with it".
 */

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const OTHER_TENANT_ID = 'aaaaaaaa-0000-4000-a000-00000000009e'
const ORG_A = 'bbbbbbbb-0000-4000-a000-00000000000a'
const ORG_B = 'bbbbbbbb-0000-4000-a000-00000000000b'
const PROFILE_A = 'cccccccc-0000-4000-a000-00000000000a'
const PROFILE_B = 'cccccccc-0000-4000-a000-00000000000b'
const PROFILE_OTHER_TENANT = 'cccccccc-0000-4000-a000-00000000000c'
const DOC_A = 'dddddddd-0000-4000-a000-00000000000a'
const DOC_B = 'dddddddd-0000-4000-a000-00000000000b'

function profile(id: string, organizationId: string, tenantId: string): DealerProfile {
  return {
    id,
    organizationId,
    tenantId,
    businessName: `Dealer ${id}`,
    contactEmail: 'dealer@test.in',
    phone: '+91 99999 00000',
    businessType: 'pvt_ltd',
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
    kycStatus: 'under_review',
    deletedAt: null,
  } as DealerProfile
}

function document(id: string, dealerProfileId: string, tenantId: string): DealerKycDocument {
  return {
    id,
    dealerProfileId,
    tenantId,
    documentType: 'gst_certificate',
    storageKey: `attachment-for-${id}`,
    fileName: 'gst.pdf',
    fileSizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: new Date('2026-01-01'),
    deletedAt: null,
  } as DealerKycDocument
}

const PROFILES = [
  profile(PROFILE_A, ORG_A, TENANT_ID),
  profile(PROFILE_B, ORG_B, TENANT_ID),
  profile(PROFILE_OTHER_TENANT, ORG_A, OTHER_TENANT_ID),
]
const DOCUMENTS = [
  document(DOC_A, PROFILE_A, TENANT_ID),
  document(DOC_B, PROFILE_B, TENANT_ID),
]

/** Minimal fake EntityManager that honours exact-match filters like a real WHERE clause. */
function makeFakeEm() {
  return {
    findOne: jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
      const isProfileEntity = (entity as { name?: string })?.name !== 'DealerKycDocument'
      const pool = isProfileEntity ? PROFILES : DOCUMENTS
      return (
        pool.find((row) =>
          Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
        ) ?? null
      )
    }),
  }
}

describe('KYC document access — dealer-side (loadOwnDealerDocument)', () => {
  it('resolves the owning dealer\'s own document', async () => {
    const em = makeFakeEm()
    const { document: doc, profile: p } = await loadOwnDealerDocument(em as never, ORG_A, TENANT_ID, DOC_A)
    expect(doc.id).toBe(DOC_A)
    expect(p.id).toBe(PROFILE_A)
  })

  it('fails closed when dealer B\'s session requests dealer A\'s document id', async () => {
    const em = makeFakeEm()
    await expect(loadOwnDealerDocument(em as never, ORG_B, TENANT_ID, DOC_A)).rejects.toThrow('Document not found')
  })

  it('fails closed for a cross-tenant session even with a matching org id', async () => {
    const em = makeFakeEm()
    // ORG_A exists in TENANT_ID too, but this session's tenant is different —
    // findOwnProfile must not match the other tenant's profile row.
    await expect(loadOwnDealerDocument(em as never, ORG_A, OTHER_TENANT_ID, DOC_A)).rejects.toThrow()
  })
})

describe('KYC document access — admin review (loadDealerDocumentForReview)', () => {
  it('resolves a document for the matching application within the admin\'s tenant', async () => {
    const em = makeFakeEm()
    const { document: doc, profile: p } = await loadDealerDocumentForReview(em as never, TENANT_ID, PROFILE_A, DOC_A)
    expect(doc.id).toBe(DOC_A)
    expect(p.id).toBe(PROFILE_A)
  })

  it('fails closed when the document id belongs to a different application than the one in the path', async () => {
    const em = makeFakeEm()
    // DOC_B belongs to PROFILE_B, not PROFILE_A — an admin reviewing
    // application PROFILE_A must never be able to pull PROFILE_B's document
    // by swapping the documentId in the URL.
    await expect(loadDealerDocumentForReview(em as never, TENANT_ID, PROFILE_A, DOC_B)).rejects.toThrow('Document not found')
  })

  it('fails closed for an application that exists only in a different tenant', async () => {
    const em = makeFakeEm()
    await expect(loadDealerDocumentForReview(em as never, TENANT_ID, PROFILE_OTHER_TENANT, DOC_A)).rejects.toThrow()
  })
})

describe('buildReviewerAttachmentAuth', () => {
  it('switches the auth scope to the REVIEWED DEALER\'s tenant+org, never the admin\'s own', async () => {
    const em = makeFakeEm()
    const { profile: p } = await loadDealerDocumentForReview(em as never, TENANT_ID, PROFILE_B, DOC_B)
    const adminAuth = { sub: 'admin-user-1', tenantId: TENANT_ID, orgId: 'admin-home-org', isSuperAdmin: false }
    const scoped = buildReviewerAttachmentAuth(adminAuth as never, p)
    expect(scoped.orgId).toBe(ORG_B)
    expect(scoped.tenantId).toBe(TENANT_ID)
    // Identity fields are preserved — only the scope used for the one
    // attachment read is switched.
    expect(scoped.sub).toBe('admin-user-1')
  })
})
