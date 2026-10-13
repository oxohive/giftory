import { describe, expect, it, jest } from '@jest/globals'
import {
  buildAdminKycDocumentFileUrl,
  downloadKycDocumentFile,
  type FetchBlobResult,
} from '../kycDocumentDownload'

const APPLICATION_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const DOCUMENT_ID = 'bbbbbbbb-0000-4000-a000-000000000002'

describe('buildAdminKycDocumentFileUrl', () => {
  it('always targets the one documented, access-controlled admin review endpoint', () => {
    const url = buildAdminKycDocumentFileUrl(APPLICATION_ID, DOCUMENT_ID)
    expect(url).toBe(
      `/api/dealer_onboarding/admin/dealers/applications/${APPLICATION_ID}/documents/${DOCUMENT_ID}/file`,
    )
  })

  it('percent-encodes both ids', () => {
    const url = buildAdminKycDocumentFileUrl('a/b', 'c d')
    expect(url).toBe('/api/dealer_onboarding/admin/dealers/applications/a%2Fb/documents/c%20d/file')
  })

  it('never produces a raw/unauthenticated storage link — no storageKey, attachment-id-only, or presigned-URL shape', () => {
    const url = buildAdminKycDocumentFileUrl(APPLICATION_ID, DOCUMENT_ID)
    expect(url.startsWith('/api/dealer_onboarding/admin/dealers/applications/')).toBe(true)
    expect(url).not.toMatch(/storage|signed|presign|s3|attachments\//i)
  })

  it('throws rather than building a URL missing either id', () => {
    expect(() => buildAdminKycDocumentFileUrl('', DOCUMENT_ID)).toThrow()
    expect(() => buildAdminKycDocumentFileUrl(APPLICATION_ID, '')).toThrow()
  })
})

function makeFetchBlob(result: FetchBlobResult) {
  return jest.fn<(url: string) => Promise<FetchBlobResult>>().mockResolvedValue(result)
}

describe('downloadKycDocumentFile', () => {
  it('fetches via the one authorized URL and saves the returned blob under the document\'s real file name', async () => {
    const blob = { size: 10 } as unknown as Blob
    const fetchBlob = makeFetchBlob({ ok: true, status: 200, blob })
    const save = jest.fn<(blob: Blob, fileName: string) => void>()

    const result = await downloadKycDocumentFile({
      applicationId: APPLICATION_ID,
      documentId: DOCUMENT_ID,
      fileName: 'gst-certificate.pdf',
      fetchBlob,
      save,
    })

    expect(result).toEqual({ ok: true })
    expect(fetchBlob).toHaveBeenCalledWith(buildAdminKycDocumentFileUrl(APPLICATION_ID, DOCUMENT_ID))
    expect(save).toHaveBeenCalledWith(blob, 'gst-certificate.pdf')
  })

  it('never calls save and reports "forbidden" on a 401/403 — an unauthorized caller gets nothing, not a partial file', async () => {
    const save = jest.fn<(blob: Blob, fileName: string) => void>()
    const result = await downloadKycDocumentFile({
      applicationId: APPLICATION_ID,
      documentId: DOCUMENT_ID,
      fileName: 'gst-certificate.pdf',
      fetchBlob: makeFetchBlob({ ok: false, status: 403, blob: null }),
      save,
    })
    expect(result).toEqual({ ok: false, error: { code: 'forbidden', status: 403 } })
    expect(save).not.toHaveBeenCalled()
  })

  it('reports "not_found" on a 404 (wrong document for this application / cross-tenant id)', async () => {
    const result = await downloadKycDocumentFile({
      applicationId: APPLICATION_ID,
      documentId: DOCUMENT_ID,
      fileName: 'gst-certificate.pdf',
      fetchBlob: makeFetchBlob({ ok: false, status: 404, blob: null }),
    })
    expect(result).toEqual({ ok: false, error: { code: 'not_found', status: 404 } })
  })

  it('reports "request_failed" for anything else (500, network failure)', async () => {
    const result = await downloadKycDocumentFile({
      applicationId: APPLICATION_ID,
      documentId: DOCUMENT_ID,
      fileName: 'gst-certificate.pdf',
      fetchBlob: makeFetchBlob({ ok: false, status: 500, blob: null }),
    })
    expect(result).toEqual({ ok: false, error: { code: 'request_failed', status: 500 } })
  })
})
