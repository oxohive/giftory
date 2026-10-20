/**
 * Secure KYC document download for the admin review screen.
 *
 * This module exists specifically so there is exactly ONE place that
 * constructs the URL used to fetch a dealer's private KYC document bytes —
 * `GET /api/dealer_onboarding/admin/dealers/applications/{id}/documents/{documentId}/file`
 * (TASK-03, API-CONTRACTS.md). That route fails closed: it re-checks the
 * document belongs to the application in the path, then reads it through
 * `attachmentService.readScoped` with the REVIEWED dealer's scope. The
 * review UI must NEVER construct any other URL to reach a KYC document —
 * no raw/unauthenticated storage link, no `storageKey`-based URL, nothing
 * that bypasses this route's two authorization checks. `__tests__/
 * kycDocumentDownload.test.ts` locks this in.
 *
 * The actual byte fetch always goes through the caller's authenticated
 * `apiCall` (same-origin, httpOnly session cookie) — this module takes an
 * injected `fetchBlob` so the request/response handling here is testable
 * without a browser or a real network call.
 */

export function buildAdminKycDocumentFileUrl(applicationId: string, documentId: string): string {
  if (!applicationId || !documentId) {
    throw new Error('applicationId and documentId are required to build a KYC document download URL')
  }
  return `/api/dealer_onboarding/admin/dealers/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/file`
}

export type FetchBlobResult = { ok: boolean; status: number; blob: Blob | null }

export type DownloadFailure =
  | { code: 'forbidden'; status: number }
  | { code: 'not_found'; status: number }
  | { code: 'request_failed'; status: number }

export type DownloadResult =
  | { ok: true }
  | { ok: false; error: DownloadFailure }

/**
 * Triggers a browser save of an already-fetched blob. Mirrors the
 * `createObjectURL`/anchor-click pattern already shipped in
 * `@open-mercato/ui`'s `DataTable` export menu — not independently unit
 * tested here for the same reason that precedent isn't: it is a thin,
 * browser-only DOM dance with no branching logic. The logic that IS
 * specific to this feature (URL construction, response-status handling)
 * is covered by `downloadKycDocumentFile` below.
 */
export function triggerBrowserDownload(blob: Blob, fileName: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(href)
}

export type DownloadKycDocumentInput = {
  applicationId: string
  documentId: string
  fileName: string
  fetchBlob: (url: string) => Promise<FetchBlobResult>
  save?: (blob: Blob, fileName: string) => void
}

/**
 * Fetches one KYC document's bytes through the one authorized endpoint and
 * saves it client-side. Never falls back to any other URL on failure —
 * a 401/403/404 from the controlled endpoint is a real, final answer
 * (the caller shows an access-denied/not-found state), not a cue to try an
 * alternate path.
 */
export async function downloadKycDocumentFile(input: DownloadKycDocumentInput): Promise<DownloadResult> {
  const url = buildAdminKycDocumentFileUrl(input.applicationId, input.documentId)
  const result = await input.fetchBlob(url)

  if (!result.ok || !result.blob) {
    if (result.status === 401 || result.status === 403) {
      return { ok: false, error: { code: 'forbidden', status: result.status } }
    }
    if (result.status === 404) {
      return { ok: false, error: { code: 'not_found', status: result.status } }
    }
    return { ok: false, error: { code: 'request_failed', status: result.status } }
  }

  const save = input.save ?? triggerBrowserDownload
  save(result.blob, input.fileName)
  return { ok: true }
}
