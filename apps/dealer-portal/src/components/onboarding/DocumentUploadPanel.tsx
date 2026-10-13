'use client'

import { ApiError, type DealerDocument } from '@gift/api-client'
import { Button, ErrorNotice, LoadingState } from '@gift/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchOnboardingStatus, type OnboardingStatusResponse } from '@/lib/features/onboarding/api'
import {
  DEALER_DOCUMENT_MIME_PATTERN,
  DEALER_DOCUMENT_TYPES,
  DOCUMENT_ACCEPT_ATTR,
  DOCUMENT_ACCEPT_LABEL,
  DOCUMENT_TYPE_LABELS,
  MAX_DOCUMENT_SIZE_BYTES,
  type DealerDocumentType,
} from '@/lib/features/onboarding/constants'
import {
  kycDocumentFileUrl,
  RateLimitedUploadError,
  uploadKycDocument,
  type UploadProgress,
} from '@/lib/features/onboarding/documentUpload'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Pre-upload validation — mirrors the backend's own cheap pre-checks (size, declared mime)
 *  so an obviously-rejected file never starts a network transfer. The backend still re-checks
 *  both (declared AND sniffed) after upload — this is advisory only, never the source of truth. */
function validateFile(file: File): string | null {
  if (file.size === 0) return 'The selected file is empty.'
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) return `File exceeds the maximum upload size of 10 MB.`
  if (file.type && !DEALER_DOCUMENT_MIME_PATTERN.test(file.type)) {
    return `Unsupported file type. Use ${DOCUMENT_ACCEPT_LABEL}.`
  }
  return null
}

type RowState =
  | { phase: 'idle' }
  | { phase: 'validation-error'; message: string }
  | { phase: 'uploading'; progress: UploadProgress; abort: AbortController }
  | { phase: 'error'; message: string; retryAfterSeconds?: number | null }
  | { phase: 'done'; document: UploadedSummary }

interface UploadedSummary {
  id: string
  fileName: string
}

function DocumentTypeRow({
  documentType,
  existing,
  canUpload,
  onUploaded,
}: {
  documentType: DealerDocumentType
  existing: DealerDocument | undefined
  canUpload: boolean
  onUploaded: (doc: UploadedSummary) => void
}) {
  const [state, setState] = useState<RowState>({ phase: 'idle' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(file: File | null) {
    setSelectedFile(file)
    if (!file) {
      setState({ phase: 'idle' })
      return
    }
    const validationError = validateFile(file)
    setState(validationError ? { phase: 'validation-error', message: validationError } : { phase: 'idle' })
  }

  function startUpload() {
    if (!selectedFile) return
    const validationError = validateFile(selectedFile)
    if (validationError) {
      setState({ phase: 'validation-error', message: validationError })
      return
    }
    const abort = new AbortController()
    setState({ phase: 'uploading', progress: { loaded: 0, total: selectedFile.size }, abort })
    uploadKycDocument({
      documentType,
      file: selectedFile,
      signal: abort.signal,
      onProgress: (progress) => setState((prev) => (prev.phase === 'uploading' ? { ...prev, progress } : prev)),
    })
      .then((result) => {
        // Only ever reached on a genuine 2xx from the real upload transport (see
        // documentUpload.ts / TASK-03) — never marked done on a transport failure.
        setState({ phase: 'done', document: result })
        setSelectedFile(null)
        onUploaded(result)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setState({ phase: 'idle' })
          return
        }
        if (err instanceof RateLimitedUploadError) {
          setState({ phase: 'error', message: err.message, retryAfterSeconds: err.retryAfterSeconds })
          return
        }
        const message = err instanceof ApiError ? err.message : 'The upload failed. Please try again.'
        // Deliberately keep `selectedFile` set here (not cleared) — the applicant should not
        // have to re-pick the same file to retry a failed upload.
        setState({ phase: 'error', message })
      })
  }

  function cancelUpload() {
    if (state.phase === 'uploading') state.abort.abort()
  }

  const percent =
    state.phase === 'uploading' && state.progress.total > 0
      ? Math.round((state.progress.loaded / state.progress.total) * 100)
      : null

  const displayDocument = state.phase === 'done' ? { id: state.document.id, fileName: state.document.fileName } : existing

  return (
    <div className="grid gap-2 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{DOCUMENT_TYPE_LABELS[documentType]}</h3>
        {displayDocument ? (
          <a
            href={kycDocumentFileUrl(displayDocument.id, { download: true })}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Download
          </a>
        ) : null}
      </div>

      {displayDocument ? (
        <p className="text-xs text-muted-foreground">
          Uploaded: {displayDocument.fileName}
          {existing && state.phase !== 'done' ? ` · ${formatBytes(existing.fileSizeBytes)}` : null}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Not uploaded yet.</p>
      )}

      {!canUpload ? (
        <p className="text-xs text-muted-foreground">
          Documents can only be uploaded while your application is pending or under review.
        </p>
      ) : (
        <div className="grid gap-2">
          <label htmlFor={`file-${documentType}`} className="sr-only">
            {displayDocument ? `Replace ${DOCUMENT_TYPE_LABELS[documentType]}` : `Upload ${DOCUMENT_TYPE_LABELS[documentType]}`}
          </label>
          <input
            ref={inputRef}
            id={`file-${documentType}`}
            type="file"
            accept={DOCUMENT_ACCEPT_ATTR}
            disabled={state.phase === 'uploading'}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <p className="text-xs text-muted-foreground">{DOCUMENT_ACCEPT_LABEL}</p>

          {state.phase === 'validation-error' ? <ErrorNotice message={state.message} /> : null}

          {state.phase === 'uploading' ? (
            <div className="grid gap-1">
              <div
                role="progressbar"
                aria-valuenow={percent ?? undefined}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Uploading ${DOCUMENT_TYPE_LABELS[documentType]}`}
                className="h-2 w-full overflow-hidden rounded-full bg-secondary"
              >
                <div className="h-full bg-primary transition-[width]" style={{ width: `${percent ?? 0}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{percent !== null ? `${percent}%` : 'Uploading…'}</span>
                <button
                  type="button"
                  onClick={cancelUpload}
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {state.phase === 'error' ? (
            <div className="grid gap-2">
              <ErrorNotice message={state.message} onRetry={selectedFile ? startUpload : undefined} />
              {state.retryAfterSeconds ? (
                <p className="text-xs text-muted-foreground">Try again in about {state.retryAfterSeconds} seconds.</p>
              ) : null}
            </div>
          ) : null}

          {state.phase === 'done' ? <p className="text-xs font-medium text-success">Uploaded successfully.</p> : null}

          {state.phase !== 'uploading' && selectedFile && state.phase !== 'done' ? (
            <Button type="button" size="sm" onClick={startUpload} className="justify-self-start">
              {displayDocument ? 'Upload replacement' : 'Upload'}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * Document upload/replacement screen. Fetches the applicant's own status (for `kycStatus` +
 * already-uploaded documents) on mount, independently of the `/onboarding/status` page, so this
 * page is directly linkable/bookmarkable on its own.
 */
export function DocumentUploadPanel() {
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Only sets state from inside the promise's own callbacks (see the identical note in
  // ApplicationStatus.tsx) — `load()` below does the synchronous reset for the retry/refresh
  // call sites, which never run directly inside an effect body.
  const fetchStatus = useCallback(() => {
    fetchOnboardingStatus()
      .then((result) => setStatus(result))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const documentsByType = useMemo(() => {
    const map = new Map<string, DealerDocument>()
    for (const doc of status?.documents ?? []) map.set(doc.documentType, doc)
    return map
  }, [status])

  function handleUploaded(documentType: DealerDocumentType, doc: UploadedSummary) {
    // Refresh from the server rather than trusting the optimistic local result for anything
    // beyond the immediate row — keeps the rest of the page (e.g. a later kycStatus transition
    // to under_review on first upload) accurate without a second manual reload.
    void doc
    load()
    void documentType
  }

  if (loading) return <LoadingState label="Loading your application…" />
  if (loadError) {
    return <ErrorNotice message={loadError} onRetry={load} />
  }
  if (!status) return null

  const canUpload = status.kycStatus === 'pending_verification' || status.kycStatus === 'under_review'

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">KYC documents</h1>
        <p className="text-sm text-muted-foreground">
          Upload clear copies of each document below. Replacing a document discards the previous
          copy for that type.
        </p>
      </div>
      <div className="grid gap-3">
        {DEALER_DOCUMENT_TYPES.map((type) => (
          <DocumentTypeRow
            key={type}
            documentType={type}
            existing={documentsByType.get(type)}
            canUpload={canUpload}
            onUploaded={(doc) => handleUploaded(type, doc)}
          />
        ))}
      </div>
    </div>
  )
}
