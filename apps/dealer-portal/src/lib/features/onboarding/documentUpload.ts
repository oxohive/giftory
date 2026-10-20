'use client'

/**
 * Client-side transport for KYC document upload/download, talking to the dedicated routes this
 * task built under `app/(onboarding)/api/onboarding/documents/` — NOT `@gift/api-client`'s
 * `request()`, for two reasons: (1) that helper hardcodes the `/api/om/` prefix, a different
 * path than these routes; (2) upload progress needs `XMLHttpRequest` (`fetch` has no portable
 * upload-progress event), so this couldn't reuse `request()`'s `fetch` call even if the path
 * matched. Error shape/semantics are kept deliberately consistent with `@gift/api-client`'s
 * `ApiError` (same class, reused) so a caller can handle either the same way.
 */
import { ApiError } from '@gift/api-client'

export interface UploadProgress {
  loaded: number
  total: number
}

export interface UploadedDocument {
  id: string
  documentType: string
  fileName: string
}

/** Thrown instead of a plain ApiError on a 429 from the upload route, carrying the real
 *  `Retry-After` seconds the backend's rate limiter reported — see
 *  `@open-mercato/shared/lib/ratelimit/helpers.ts`'s `checkRateLimit`, verified to set this
 *  header on every 429 it returns. */
export class RateLimitedUploadError extends ApiError {
  readonly retryAfterSeconds: number | null

  constructor(message: string, retryAfterSeconds: number | null) {
    super(429, message)
    this.name = 'RateLimitedUploadError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function messageFor(status: number, body: { error?: string }): string {
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 429) return 'Too many upload attempts. Please wait before trying again.'
  if (typeof body.error === 'string' && body.error) return body.error
  return 'The upload failed. Please try again.'
}

/**
 * Uploads one KYC document's real bytes with progress reporting and cooperative cancellation.
 * Resolves only on a genuine 2xx from the backend transport (see TASK-03: the backend itself
 * never records the document row unless `attachmentService.createScoped` actually stored the
 * bytes first) — there is no path here that can resolve "success" after a transport failure.
 */
export function uploadKycDocument(params: {
  documentType: string
  file: File
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}): Promise<UploadedDocument> {
  return new Promise((resolve, reject) => {
    if (params.signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/onboarding/documents')
    xhr.responseType = 'text'

    const onAbort = () => xhr.abort()
    params.signal?.addEventListener('abort', onAbort)
    const detach = () => params.signal?.removeEventListener('abort', onAbort)

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) params.onProgress?.({ loaded: evt.loaded, total: evt.total })
    }

    xhr.onabort = () => {
      detach()
      reject(new DOMException('Upload cancelled', 'AbortError'))
    }

    xhr.onerror = () => {
      detach()
      reject(new ApiError(0, 'Network error. Please check your connection and try again.'))
    }

    xhr.onload = () => {
      detach()
      let body: { error?: string; code?: string; details?: Array<{ path: unknown; message: string }> } = {}
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : {}
      } catch {
        body = {}
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as unknown as UploadedDocument)
        return
      }
      if (xhr.status === 429) {
        const retryAfterHeader = xhr.getResponseHeader('retry-after')
        const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : null
        reject(new RateLimitedUploadError(messageFor(429, body), Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null))
        return
      }
      reject(new ApiError(xhr.status || 0, messageFor(xhr.status, body), { code: body.code, details: body.details as never }))
    }

    const form = new FormData()
    form.set('documentType', params.documentType)
    form.set('file', params.file)
    xhr.send(form)
  })
}

/** URL for the caller's own KYC document — GET streams the bytes through the dedicated download
 *  route (see app/(onboarding)/api/onboarding/documents/[id]/file/route.ts). `download: true`
 *  requests `Content-Disposition: attachment` from the backend rather than inline display. */
export function kycDocumentFileUrl(documentId: string, options: { download?: boolean } = {}): string {
  const suffix = options.download ? '?download=1' : ''
  return `/api/onboarding/documents/${encodeURIComponent(documentId)}/file${suffix}`
}
