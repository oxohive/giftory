'use client'

import { ApiError } from '@gift/api-client'
import { ErrorNotice, formatDateTime, LoadingState, StatusBadge } from '@gift/ui'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { fetchOnboardingStatus, type OnboardingStatusResponse } from '@/lib/features/onboarding/api'
import { BUSINESS_TYPE_LABELS, DEALER_DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from '@/lib/features/onboarding/constants'
import type { DealerBusinessType } from '@/lib/features/onboarding/constants'

/**
 * Application status screen — a detailed view of the applicant's own submitted business
 * details, KYC status, and uploaded documents. Complements (does not replace) TASK-04's
 * `/pending` holding page: `/pending` is the redirect target `requireApprovedDealer()` sends a
 * not-yet-approved caller to from every PORTAL page; this screen is this task's own, reachable
 * at `/onboarding/status`, with the full detail (business fields, per-document upload state)
 * `/pending`'s minimal badge-only view does not carry. `/pending` is outside this task's owned
 * paths ((auth)/), so it could not be updated here to link to this page — see this task's
 * handoff for that cross-task coordination note.
 */
export function ApplicationStatus() {
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unauthorized, setUnauthorized] = useState(false)
  const [loading, setLoading] = useState(true)

  // Only sets state from inside the promise's own callbacks, never synchronously at the top of
  // the function — `retry()` below does the synchronous reset, so this stays safe to call
  // directly from the mount effect (react-hooks/set-state-in-effect flags a synchronous setState
  // reachable from an effect body, including transitively through a called function).
  const fetchStatus = useCallback(() => {
    fetchOnboardingStatus()
      .then((result) => setStatus(result))
      .catch((err) => {
        if (err instanceof ApiError && err.isUnauthorized) {
          setUnauthorized(true)
          return
        }
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  function retry() {
    setLoading(true)
    setError(null)
    setUnauthorized(false)
    fetchStatus()
  }

  if (loading) return <LoadingState label="Loading your application…" />
  if (unauthorized) {
    return (
      <div className="grid gap-3 text-center">
        <p className="text-sm text-muted-foreground">Your session has ended.</p>
        <Link
          href="/login?returnTo=/onboarding/status"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign in
        </Link>
      </div>
    )
  }
  if (error) return <ErrorNotice message={error} onRetry={retry} />
  if (!status) return null

  const uploadedTypes = new Set((status.documents ?? []).map((d) => d.documentType))
  const allDocumentsUploaded = DEALER_DOCUMENT_TYPES.every((type) => uploadedTypes.has(type))

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Application status</h1>
          <p className="text-sm text-muted-foreground">{status.businessName}</p>
        </div>
        <StatusBadge value={status.kycStatus} />
      </div>

      {status.kycStatus === 'rejected' ? (
        <div className="grid gap-2 rounded-md border border-danger/40 bg-danger/10 p-4">
          <p className="text-sm font-medium text-foreground">
            {status.rejectionReason ? `Reason: ${status.rejectionReason}` : 'No reason was provided.'}
          </p>
          <Link
            href="/onboarding/resubmit"
            className="inline-flex h-9 w-fit items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Resubmit application
          </Link>
        </div>
      ) : null}

      {status.kycStatus === 'approved' ? (
        <div className="grid gap-2 rounded-md border border-success/40 bg-success/10 p-4">
          <p className="text-sm text-foreground">Your application has been approved.</p>
          <Link href="/" className="inline-flex h-9 w-fit items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Go to dashboard
          </Link>
        </div>
      ) : null}

      {(status.kycStatus === 'pending_verification' || status.kycStatus === 'under_review') && !allDocumentsUploaded ? (
        <div className="grid gap-2 rounded-md border border-border bg-surface-muted p-4">
          <p className="text-sm text-foreground">Finish uploading your KYC documents to speed up review.</p>
          <Link
            href="/onboarding/documents"
            className="inline-flex h-9 w-fit items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Upload documents
          </Link>
        </div>
      ) : null}

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold text-foreground">Business details</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          <DetailRow label="Business type" value={BUSINESS_TYPE_LABELS[status.businessType as DealerBusinessType] ?? status.businessType} />
          <DetailRow label="Contact email" value={status.contactEmail} />
          <DetailRow label="Phone" value={status.phone} />
          <DetailRow label="City" value={status.city} />
          <DetailRow label="State" value={status.state} />
          <DetailRow label="Pincode" value={status.pincode} />
        </dl>
        <p className="text-xs text-muted-foreground">
          GSTIN and PAN are kept private and are not shown here. Use Resubmit to update them if needed.
        </p>
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">KYC documents</h2>
          <Link href="/onboarding/documents" className="text-sm text-primary underline-offset-4 hover:underline">
            Manage documents
          </Link>
        </div>
        <ul className="grid gap-1 text-sm text-foreground">
          {DEALER_DOCUMENT_TYPES.map((type) => {
            const doc = status.documents?.find((d) => d.documentType === type)
            return (
              <li key={type} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span>{DOCUMENT_TYPE_LABELS[type]}</span>
                {doc ? (
                  <span className="text-xs text-muted-foreground">Uploaded {formatDateTime(doc.uploadedAt)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not uploaded</span>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <LogoutButton className="justify-self-start" />
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  )
}
