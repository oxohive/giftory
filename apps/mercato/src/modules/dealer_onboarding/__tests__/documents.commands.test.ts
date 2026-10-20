import { describe, expect, it, jest } from '@jest/globals'
import type { DealerProfile, DealerKycDocument } from '../data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

jest.mock('@open-mercato/shared/lib/commands/scope', () => ({
  ensureTenantScope: () => undefined,
  ensureOrganizationScope: () => undefined,
}))

import { executeUploadDocument } from '../commands/documents'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID  = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID     = 'bbbbbbbb-0000-4000-a000-000000000002'
const PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'
const ATTACHMENT_ID = 'dddddddd-0000-4000-a000-000000000004'

const VALID_INPUT = {
  documentType: 'gst_certificate' as const,
  fileName: 'gst.pdf',
  declaredMimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 fake pdf bytes'),
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<DealerProfile> = {}): DealerProfile {
  return {
    id: PROFILE_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    businessName: 'Test Dealer',
    contactEmail: 'dealer@test.in',
    phone: '+91 99999 00000',
    gstin: null,
    pan: null,
    businessType: 'pvt_ltd',
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
    kycStatus: 'pending_verification',
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    approvedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  } as DealerProfile
}

function makeDocument(overrides: Partial<DealerKycDocument> = {}): DealerKycDocument {
  return {
    id: 'doc-uuid-1',
    dealerProfileId: PROFILE_ID,
    tenantId: TENANT_ID,
    documentType: 'gst_certificate',
    storageKey: ATTACHMENT_ID,
    fileName: 'gst.pdf',
    fileSizeBytes: VALID_INPUT.buffer.length,
    mimeType: 'application/pdf',
    uploadedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  } as DealerKycDocument
}

function makeEm() {
  return {
    findOne: jest.fn(),
    flush: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
}

function makeDataEngine(returnDoc: DealerKycDocument) {
  return {
    createOrmEntity: jest.fn<() => Promise<DealerKycDocument>>().mockResolvedValue(returnDoc),
  }
}

function makeAttachmentService(overrides: Partial<{ createScoped: jest.Mock; releaseScoped: jest.Mock }> = {}) {
  return {
    createScoped: jest.fn().mockResolvedValue({
      id: ATTACHMENT_ID,
      url: `/api/attachments/file/${ATTACHMENT_ID}`,
      fileName: VALID_INPUT.fileName,
      mimeType: VALID_INPUT.declaredMimeType,
      fileSize: VALID_INPUT.buffer.length,
    }),
    releaseScoped: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeCtx(
  em = makeEm(),
  de = makeDataEngine(makeDocument()),
  attachmentService = makeAttachmentService(),
) {
  const container = {
    resolve: jest.fn((id: string) => {
      if (id === 'em') return em
      if (id === 'dataEngine') return de
      if (id === 'attachmentService') return attachmentService
      throw new Error(`Unknown service: ${id}`)
    }),
  }
  return {
    container,
    auth: { sub: 'dealer-user-1', tenantId: TENANT_ID, orgId: ORG_ID, isSuperAdmin: false },
    organizationScope: null,
    selectedOrganizationId: ORG_ID,
    organizationIds: [ORG_ID],
    systemActor: false,
  } as unknown as import('@open-mercato/shared/lib/commands').CommandRuntimeContext
}

// ---------------------------------------------------------------------------
// executeUploadDocument
// ---------------------------------------------------------------------------

describe('executeUploadDocument', () => {
  it('throws ZodError for an unknown document type', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile())
    const ctx = makeCtx(em)
    await expect(
      executeUploadDocument({ ...VALID_INPUT, documentType: 'invalid_type' }, ctx),
    ).rejects.toThrow()
  })

  it('throws ZodError when no file buffer is provided', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile())
    const ctx = makeCtx(em)
    await expect(
      executeUploadDocument({ ...VALID_INPUT, buffer: undefined }, ctx),
    ).rejects.toThrow()
  })

  it('throws when the dealer profile is not found for this org', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(null) // profile not found
    const ctx = makeCtx(em)
    await expect(executeUploadDocument(VALID_INPUT, ctx)).rejects.toThrow('Dealer profile not found')
  })

  it('throws when the profile is approved (cannot upload)', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'approved' }))
    const ctx = makeCtx(em)
    await expect(executeUploadDocument(VALID_INPUT, ctx)).rejects.toThrow(
      'Documents can only be uploaded while the application is pending or under review',
    )
  })

  it('throws when the profile is rejected (cannot upload)', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'rejected' }))
    const ctx = makeCtx(em)
    await expect(executeUploadDocument(VALID_INPUT, ctx)).rejects.toThrow(
      'Documents can only be uploaded while the application is pending or under review',
    )
  })

  it('rejects a file larger than the 10 MB cap before uploading any bytes', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
    const attachmentService = makeAttachmentService()
    const ctx = makeCtx(em, undefined, attachmentService)
    const oversized = { ...VALID_INPUT, buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }
    await expect(executeUploadDocument(oversized, ctx)).rejects.toThrow(/10 MB/)
    expect(attachmentService.createScoped).not.toHaveBeenCalled()
  })

  it('rejects an unsupported declared mime type before uploading any bytes', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
    const attachmentService = makeAttachmentService()
    const ctx = makeCtx(em, undefined, attachmentService)
    const badType = { ...VALID_INPUT, declaredMimeType: 'application/x-executable' }
    await expect(executeUploadDocument(badType, ctx)).rejects.toThrow(/Unsupported file type/)
    expect(attachmentService.createScoped).not.toHaveBeenCalled()
  })

  it('releases the attachment and rejects when the sniffed mime type is not allowed', async () => {
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
    const attachmentService = makeAttachmentService({
      createScoped: jest.fn().mockResolvedValue({
        id: ATTACHMENT_ID,
        url: `/api/attachments/file/${ATTACHMENT_ID}`,
        fileName: VALID_INPUT.fileName,
        mimeType: 'application/x-sharedlib', // sniffed mime differs from the declared one
        fileSize: VALID_INPUT.buffer.length,
      }),
    })
    const ctx = makeCtx(em, undefined, attachmentService)
    await expect(executeUploadDocument(VALID_INPUT, ctx)).rejects.toThrow(/Unsupported file type/)
    expect(attachmentService.releaseScoped).toHaveBeenCalledTimes(1)
  })

  it('uploads real bytes via attachmentService.createScoped and persists the returned attachment id as storageKey', async () => {
    const newDoc = makeDocument()
    const em = makeEm()
    const de = makeDataEngine(newDoc)
    const attachmentService = makeAttachmentService()
    // profile found; no existing doc
    em.findOne.mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' })).mockResolvedValueOnce(null)

    const ctx = makeCtx(em, de, attachmentService)
    const result = await executeUploadDocument(VALID_INPUT, ctx)

    expect(attachmentService.createScoped).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        recordId: PROFILE_ID,
        fileName: VALID_INPUT.fileName,
        buffer: VALID_INPUT.buffer,
      }),
    )
    expect(de.createOrmEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storageKey: ATTACHMENT_ID }),
      }),
    )
    expect(result.id).toBe(newDoc.id)
    // under_review stays under_review — no flush for status advance
    expect(em.flush).toHaveBeenCalledTimes(0)
  })

  it('soft-deletes an existing document of the same type before creating a replacement', async () => {
    const existingDoc = makeDocument({ id: 'old-doc-id', deletedAt: null })
    const newDoc = makeDocument({ id: 'new-doc-id' })
    const em = makeEm()
    const de = makeDataEngine(newDoc)
    em.findOne
      .mockResolvedValueOnce(makeProfile({ kycStatus: 'under_review' }))
      .mockResolvedValueOnce(existingDoc)

    const ctx = makeCtx(em, de)
    await executeUploadDocument(VALID_INPUT, ctx)

    expect(existingDoc.deletedAt).toBeInstanceOf(Date)
    // flush once for the soft-delete; no second flush (status stays under_review)
    expect(em.flush).toHaveBeenCalledTimes(1)
    expect(de.createOrmEntity).toHaveBeenCalledTimes(1)
  })

  it('advances profile from pending_verification to under_review after first upload', async () => {
    const profile = makeProfile({ kycStatus: 'pending_verification' })
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(profile).mockResolvedValueOnce(null)

    const ctx = makeCtx(em)
    await executeUploadDocument(VALID_INPUT, ctx)

    expect(profile.kycStatus).toBe('under_review')
    expect(em.flush).toHaveBeenCalledTimes(1) // flush for status advance
  })

  it('does not advance profile that is already under_review', async () => {
    const profile = makeProfile({ kycStatus: 'under_review' })
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(profile).mockResolvedValueOnce(null)

    const ctx = makeCtx(em)
    await executeUploadDocument(VALID_INPUT, ctx)

    expect(profile.kycStatus).toBe('under_review')
    expect(em.flush).toHaveBeenCalledTimes(0)
  })

  it('flushes twice when there is an existing doc AND the profile is pending_verification', async () => {
    const profile = makeProfile({ kycStatus: 'pending_verification' })
    const existingDoc = makeDocument({ deletedAt: null })
    const em = makeEm()
    em.findOne.mockResolvedValueOnce(profile).mockResolvedValueOnce(existingDoc)

    const ctx = makeCtx(em)
    await executeUploadDocument(VALID_INPUT, ctx)

    expect(existingDoc.deletedAt).toBeInstanceOf(Date)
    expect(profile.kycStatus).toBe('under_review')
    expect(em.flush).toHaveBeenCalledTimes(2)
  })
})
