import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import type { AuthContext } from '@open-mercato/shared/lib/auth/server'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { DefaultAttachmentService } from '@open-mercato/core/modules/attachments/lib/attachment-service'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import type { DealerKycDocument, DealerProfile } from '../data/entities'
import { DEALER_DOCUMENT_ATTACHMENT_PARTITION, DEALER_DOCUMENT_ENTITY_ID } from '../lib/constants'

// The attachments service module transitively imports the upload-side OCR /
// text-extraction helpers, which pull in ESM-only AI SDK packages Jest's
// CommonJS runtime cannot load. `readScoped` never uses them, so stub them.
jest.mock('@open-mercato/core/modules/attachments/lib/ocrService', () => ({
  OcrService: class {},
  shouldUseLlmOcr: () => false,
}))
jest.mock('@open-mercato/core/modules/attachments/lib/ocrQueue', () => ({ requestOcrProcessing: async () => undefined }))
jest.mock('@open-mercato/core/modules/attachments/lib/textExtraction', () => ({ extractAttachmentContent: async () => null }))

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

import { buildReviewerAttachmentAuth, resolveKycAttachmentId } from '../commands/shared'

/**
 * Known gap 6 — proof that a KYC document can only ever resolve to an
 * attachment in the dealer's OWN tenant + organization, in the private KYC
 * partition, owned by that dealer's profile.
 *
 * Drives the REAL installed `DefaultAttachmentService.readScoped` with exactly
 * the arguments the two download routes build (`resolveKycAttachmentId`,
 * session auth / `buildReviewerAttachmentAuth`, `expectedOwner`,
 * `expectedPartitionCode`, `requirePrivatePartition`). Only the database and
 * the storage driver are faked; the fake EntityManager filters fixtures like a
 * SQL WHERE clause, so a foreign row genuinely cannot be found.
 */

const TENANT = 'aaaaaaaa-0000-4000-a000-000000000001'
const OTHER_TENANT = 'aaaaaaaa-0000-4000-a000-000000000002'
const ORG_A = 'bbbbbbbb-0000-4000-a000-00000000000a'
const ORG_B = 'bbbbbbbb-0000-4000-a000-00000000000b'
const PROFILE_A = 'cccccccc-0000-4000-a000-00000000000a'
const PROFILE_B = 'cccccccc-0000-4000-a000-00000000000b'

const ATT = {
  own: '11111111-0000-4000-a000-000000000001',
  otherDealer: '11111111-0000-4000-a000-000000000002',
  otherTenant: '11111111-0000-4000-a000-000000000003',
  publicPartition: '11111111-0000-4000-a000-000000000004',
  otherPrivatePartition: '11111111-0000-4000-a000-000000000005',
  otherOwner: '11111111-0000-4000-a000-000000000006',
}

function attachment(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tenantId: TENANT,
    organizationId: ORG_A,
    partitionCode: DEALER_DOCUMENT_ATTACHMENT_PARTITION,
    entityId: DEALER_DOCUMENT_ENTITY_ID,
    recordId: PROFILE_A,
    storagePath: `path/${id}`,
    fileName: 'gst.pdf',
    mimeType: 'application/pdf',
    storageMetadata: null,
    ...overrides,
  }
}

const ATTACHMENTS = [
  attachment(ATT.own),
  attachment(ATT.otherDealer, { organizationId: ORG_B, recordId: PROFILE_B }),
  attachment(ATT.otherTenant, { tenantId: OTHER_TENANT }),
  attachment(ATT.publicPartition, { partitionCode: 'productsMedia' }),
  attachment(ATT.otherPrivatePartition, { partitionCode: 'otherPrivate' }),
  attachment(ATT.otherOwner, { entityId: 'catalog:product', recordId: PROFILE_A }),
]

const PARTITIONS = [
  { code: DEALER_DOCUMENT_ATTACHMENT_PARTITION, isPublic: false, tenantId: null, organizationId: null },
  { code: 'productsMedia', isPublic: true, tenantId: null, organizationId: null },
  { code: 'otherPrivate', isPublic: false, tenantId: null, organizationId: null },
]

function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => (row[key] ?? null) === (value ?? null))
}

function makeService() {
  const read = jest.fn(async (_partition: string, _path: string) => ({
    buffer: Buffer.from('%PDF-1.4'),
    contentType: 'application/pdf',
  }))
  const em = {
    findOne: jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
      if (entity === Attachment) return ATTACHMENTS.find((row) => matches(row, where)) ?? null
      if (entity === AttachmentPartition) return PARTITIONS.find((row) => matches(row, where)) ?? null
      throw new Error('unexpected entity')
    }),
  }
  const factory = { resolveForPartition: jest.fn(async () => ({ read })) }
  const service = new DefaultAttachmentService(em as never, factory as never)
  return { service, read }
}

function profile(id: string, organizationId: string, tenantId = TENANT) {
  return { id, organizationId, tenantId } as DealerProfile
}

function kycDocument(storageKey: string) {
  return { id: 'doc', storageKey } as DealerKycDocument
}

/** Exactly what `GET /dealer/onboarding/documents/:id/file` does after loading the caller's own document. */
async function dealerRead(service: DefaultAttachmentService, auth: NonNullable<AuthContext>, owner: DealerProfile, storageKey: string) {
  return service.readScoped({
    attachmentId: await resolveKycAttachmentId(kycDocument(storageKey)),
    auth,
    expectedOwner: { entityId: DEALER_DOCUMENT_ENTITY_ID, recordId: owner.id },
    expectedPartitionCode: DEALER_DOCUMENT_ATTACHMENT_PARTITION,
    requirePrivatePartition: true,
  })
}

async function expectStatus(promise: Promise<unknown>, statuses: number[]) {
  try {
    await promise
  } catch (err) {
    expect(isCrudHttpError(err)).toBe(true)
    expect(statuses).toContain((err as { status: number }).status)
    return
  }
  throw new Error(`expected one of HTTP ${statuses.join('/')}`)
}

const dealerA = { sub: 'user-a', tenantId: TENANT, orgId: ORG_A, isSuperAdmin: false } as NonNullable<AuthContext>
const admin = { sub: 'admin', tenantId: TENANT, orgId: 'eeeeeeee-0000-4000-a000-000000000001', isSuperAdmin: false } as NonNullable<AuthContext>

let previousFlag: string | undefined
beforeAll(() => {
  previousFlag = process.env.TENANT_DATA_ENCRYPTION
  process.env.TENANT_DATA_ENCRYPTION = 'no'
})
afterAll(() => {
  if (previousFlag === undefined) delete process.env.TENANT_DATA_ENCRYPTION
  else process.env.TENANT_DATA_ENCRYPTION = previousFlag
})

describe('KYC document reads are confined to the dealer scope and the private KYC partition', () => {
  it('reads the dealer’s own KYC attachment', async () => {
    const { service, read } = makeService()
    const result = await dealerRead(service, dealerA, profile(PROFILE_A, ORG_A), ATT.own)
    expect(result.buffer.toString()).toBe('%PDF-1.4')
    expect(read).toHaveBeenCalledWith(DEALER_DOCUMENT_ATTACHMENT_PARTITION, `path/${ATT.own}`)
  })

  it.each([
    ['another dealer’s attachment in the same tenant', ATT.otherDealer],
    ['an attachment in another tenant', ATT.otherTenant],
    ['an attachment in a public partition', ATT.publicPartition],
    ['an attachment in a different private partition', ATT.otherPrivatePartition],
    ['an attachment owned by a different entity', ATT.otherOwner],
    ['an attachment id that does not exist', '11111111-0000-4000-a000-0000000000ff'],
  ])('refuses %s without reading any bytes', async (_label, storageKey) => {
    const { service, read } = makeService()
    await expectStatus(dealerRead(service, dealerA, profile(PROFILE_A, ORG_A), storageKey), [403, 404])
    expect(read).not.toHaveBeenCalled()
  })

  it('refuses a legacy free-form key before the attachment service is consulted', async () => {
    const { service, read } = makeService()
    await expectStatus(dealerRead(service, dealerA, profile(PROFILE_A, ORG_A), 'kyc/other-tenant/doc.pdf'), [404])
    expect(read).not.toHaveBeenCalled()
  })

  it('admin review: scope switches only to the application’s own dealer org', async () => {
    const { service, read } = makeService()
    const reviewAuth = buildReviewerAttachmentAuth(admin, profile(PROFILE_A, ORG_A))
    expect(reviewAuth).toMatchObject({ tenantId: TENANT, orgId: ORG_A, sub: 'admin' })

    await expect(dealerRead(service, reviewAuth, profile(PROFILE_A, ORG_A), ATT.own)).resolves.toBeDefined()
    // Even with the switched scope, dealer B's document stays unreachable through dealer A's application.
    await expectStatus(dealerRead(service, reviewAuth, profile(PROFILE_A, ORG_A), ATT.otherDealer), [403, 404])
    expect(read).toHaveBeenCalledTimes(1)
  })
})
