import { describe, expect, it, jest } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { DealerKycDocument } from '../data/entities'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

import { resolveKycAttachmentId } from '../commands/shared'

/**
 * Known gap 6 — "storageKey on KYC document upload is trusted verbatim".
 *
 * The upload route no longer accepts any client key (bytes go through
 * `attachmentService.createScoped`, see documents.commands.test.ts). What is
 * left is the READ side: rows written by the original implementation hold a
 * client-chosen free-form `storage_key`. Those must never reach the storage
 * layer, and everything else must go through the scope/owner/partition-checked
 * `readScoped`.
 */

function doc(storageKey: unknown): DealerKycDocument {
  return { id: 'doc', storageKey } as unknown as DealerKycDocument
}

async function expectNotFound(promise: Promise<unknown>) {
  try {
    await promise
  } catch (err) {
    expect(isCrudHttpError(err)).toBe(true)
    expect((err as { status: number }).status).toBe(404)
    expect((err as { body?: { error?: string } }).body?.error).toBe('Document not found')
    return
  }
  throw new Error('expected a 404')
}

describe('resolveKycAttachmentId', () => {
  it('returns the server-generated attachment id', async () => {
    await expect(resolveKycAttachmentId(doc('dddddddd-0000-4000-a000-000000000004'))).resolves.toBe(
      'dddddddd-0000-4000-a000-000000000004',
    )
  })

  it('normalises case and surrounding whitespace', async () => {
    await expect(resolveKycAttachmentId(doc(' DDDDDDDD-0000-4000-A000-000000000004 '))).resolves.toBe(
      'dddddddd-0000-4000-a000-000000000004',
    )
  })

  it.each([
    ['a legacy client-chosen object key', 'kyc/tenant-1/gst.pdf'],
    ['an absolute URL', 'https://evil.example/doc.pdf'],
    ['a path traversal attempt', '../../other-tenant/dddddddd-0000-4000-a000-000000000004'],
    ['a uuid with trailing junk', 'dddddddd-0000-4000-a000-000000000004/../x'],
    ['an empty key', ''],
    ['a non-string', null],
  ])('rejects %s with the same 404 as an unknown document', async (_label, key) => {
    await expectNotFound(resolveKycAttachmentId(doc(key)))
  })
})

describe('KYC download routes always read through the checked attachment path', () => {
  const apiRoot = join(__dirname, '..', 'api')
  const routes = {
    dealer: readFileSync(join(apiRoot, 'dealer', 'onboarding', 'documents', '[id]', 'file', 'route.ts'), 'utf8'),
    admin: readFileSync(
      join(apiRoot, 'admin', 'dealers', 'applications', '[id]', 'documents', '[documentId]', 'file', 'route.ts'),
      'utf8',
    ),
  }

  it.each(Object.entries(routes))('%s route validates storageKey and enforces owner, partition and privacy', (_name, source) => {
    expect(source).toMatch(/const attachmentId = await resolveKycAttachmentId\(document\)/)
    expect(source).toMatch(/attachmentId,\n/)
    expect(source).not.toMatch(/attachmentId: document\.storageKey/)
    expect(source).toMatch(/expectedOwner: \{ entityId: DEALER_DOCUMENT_ENTITY_ID, recordId: profile\.id \}/)
    expect(source).toMatch(/expectedPartitionCode: DEALER_DOCUMENT_ATTACHMENT_PARTITION/)
    expect(source).toMatch(/requirePrivatePartition: true/)
  })

  it('the upload route never reads a storage key from the request', () => {
    const upload = readFileSync(join(apiRoot, 'dealer', 'onboarding', 'documents', 'route.ts'), 'utf8')
    expect(upload).not.toMatch(/form\.get\('storageKey'\)/)
    expect(upload).not.toMatch(/storageKey:/)
  })
})
