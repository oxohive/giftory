'use client'

import * as React from 'react'
import { Download, Loader2 } from 'lucide-react'
import { FormHeader } from '@open-mercato/ui/backend/forms'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LoadingMessage, ErrorMessage, RecordNotFoundState, AccessDeniedMessage } from '@open-mercato/ui/backend/detail'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { apiCall, apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { DealerKycStatus } from '../lib/constants'
import { useAdminResource, type ApplicationDetail, type ApplicationDocument } from './adminShared'
import { submitApproveApplication, canApproveFromStatus, canRejectFromStatus } from './reviewActions'
import { downloadKycDocumentFile } from './kycDocumentDownload'
import { RejectApplicationDialog } from './RejectApplicationDialog'

const KYC_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
  pending_verification: 'warning',
  under_review: 'info',
  approved: 'success',
  rejected: 'error',
}

const APPLICATIONS_LIST_HREF = '/backend/dealers/applications'

function formatTimestamp(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function ApplicationDetailPage({ applicationId }: { applicationId: string }) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [isApproving, setIsApproving] = React.useState(false)
  const [downloadingDocumentId, setDownloadingDocumentId] = React.useState<string | null>(null)
  const [accessDenied, setAccessDenied] = React.useState(false)

  const detailUrl = `/api/dealer_onboarding/admin/dealers/applications/${encodeURIComponent(applicationId)}`
  const query = useAdminResource<ApplicationDetail>(detailUrl)
  const mutationContextId = `dealer-onboarding-approve:${applicationId}`
  const { runMutation } = useGuardedMutation<{ applicationId: string; action: string }>({ contextId: mutationContextId })

  const refresh = React.useCallback(() => { void query.refetch() }, [query])

  const handleApprove = React.useCallback(async () => {
    if (isApproving) return
    const confirmed = await confirm({
      title: t('dealer_onboarding.admin.approveDialog.title', 'Approve this application?'),
      text: t(
        'dealer_onboarding.admin.approveDialog.text',
        'The dealer will be able to log in to the dealer portal and manage their profile, staff and orders.',
      ),
      confirmText: t('dealer_onboarding.admin.approveDialog.submit', 'Approve'),
    })
    if (!confirmed) return

    setIsApproving(true)
    const result = await submitApproveApplication({
      post: async () => {
        await runMutation({
          operation: () => apiCallOrThrow(
            `/api/dealer_onboarding/admin/dealers/applications/${encodeURIComponent(applicationId)}/approve`,
            { method: 'POST' },
            { errorMessage: t('dealer_onboarding.admin.approveDialog.error', 'Could not approve this application') },
          ),
          context: { applicationId, action: 'approve' },
        })
      },
    })
    setIsApproving(false)

    if (result.ok) {
      flash(t('dealer_onboarding.admin.approveDialog.success', 'Application approved'), 'success')
      refresh()
      return
    }
    if (result.error.code === 'conflict') {
      flash(
        t('dealer_onboarding.admin.conflict', 'This application was already reviewed by someone else — showing the latest status.'),
        'error',
      )
      refresh()
      return
    }
    if (result.error.code === 'forbidden') {
      setAccessDenied(true)
      return
    }
    flash(result.error.message || t('dealer_onboarding.admin.approveDialog.error', 'Could not approve this application'), 'error')
  }, [applicationId, confirm, isApproving, refresh, runMutation, t])

  const handleDownload = React.useCallback(async (doc: ApplicationDocument) => {
    setDownloadingDocumentId(doc.id)
    const result = await downloadKycDocumentFile({
      applicationId,
      documentId: doc.id,
      fileName: doc.fileName,
      fetchBlob: async (url) => {
        const call = await apiCall<Blob>(url, undefined, { parse: async (res) => res.blob() })
        return { ok: call.ok, status: call.status, blob: call.result }
      },
    })
    setDownloadingDocumentId(null)

    if (result.ok) return
    if (result.error.code === 'forbidden') {
      flash(t('dealer_onboarding.admin.documents.errorForbidden', "You don't have permission to download this document."), 'error')
      return
    }
    if (result.error.code === 'not_found') {
      flash(t('dealer_onboarding.admin.documents.errorNotFound', 'Document not found'), 'error')
      return
    }
    flash(t('dealer_onboarding.admin.documents.errorGeneric', 'Could not download this document'), 'error')
  }, [applicationId, t])

  if (query.isLoading) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dealer_onboarding.admin.loading', 'Loading application…')} />
        </PageBody>
      </Page>
    )
  }

  if (query.isError) {
    const status = (query.error as { status?: number } | undefined)?.status
    if (status === 404) {
      return (
        <Page>
          <PageBody>
            <RecordNotFoundState
              label={t('dealer_onboarding.admin.notFound', 'Application not found')}
              backHref={APPLICATIONS_LIST_HREF}
              backLabel={t('dealer_onboarding.admin.title', 'Dealer applications')}
            />
          </PageBody>
        </Page>
      )
    }
    if (status === 401 || status === 403) {
      return (
        <Page>
          <PageBody>
            <AccessDeniedMessage label={t('dealer_onboarding.admin.forbidden', "You don't have permission to review applications.")} />
          </PageBody>
        </Page>
      )
    }
    return (
      <Page>
        <PageBody>
          <ErrorMessage
            label={query.error instanceof Error ? query.error.message : t('dealer_onboarding.admin.loadError', 'Failed to load this application')}
            action={<Button type="button" variant="outline" onClick={refresh}>{t('dealer_onboarding.admin.retry', 'Retry')}</Button>}
          />
        </PageBody>
      </Page>
    )
  }

  const app = query.data
  if (!app) {
    return (
      <Page>
        <PageBody>
          <RecordNotFoundState
            label={t('dealer_onboarding.admin.notFound', 'Application not found')}
            backHref={APPLICATIONS_LIST_HREF}
            backLabel={t('dealer_onboarding.admin.title', 'Dealer applications')}
          />
        </PageBody>
      </Page>
    )
  }

  if (accessDenied) {
    return (
      <Page>
        <PageBody>
          <AccessDeniedMessage label={t('dealer_onboarding.admin.forbidden', "You don't have permission to review applications.")} />
        </PageBody>
      </Page>
    )
  }

  const kycStatus = app.kycStatus as DealerKycStatus
  const resubmitted = kycStatus === 'under_review' && Boolean(app.reviewedAt)
  const showApprove = canApproveFromStatus(kycStatus)
  const showReject = canRejectFromStatus(kycStatus)

  const businessFields: Array<{ key: string; label: string; value: string | null }> = [
    { key: 'businessName', label: t('dealer_onboarding.admin.businessName', 'Business name'), value: app.businessName },
    { key: 'contactEmail', label: t('dealer_onboarding.admin.contactEmail', 'Contact email'), value: app.contactEmail },
    { key: 'phone', label: t('dealer_onboarding.admin.phone', 'Phone'), value: app.phone },
    { key: 'businessType', label: t('dealer_onboarding.admin.businessType', 'Business type'), value: t(`dealer_onboarding.businessType.${app.businessType}`, app.businessType) },
    { key: 'city', label: t('dealer_onboarding.admin.city', 'City'), value: app.city },
    { key: 'state', label: t('dealer_onboarding.admin.state', 'State'), value: app.state },
    { key: 'pincode', label: t('dealer_onboarding.admin.pincode', 'Pincode'), value: app.pincode },
    { key: 'gstin', label: t('dealer_onboarding.admin.gstin', 'GSTIN'), value: app.gstin },
    { key: 'pan', label: t('dealer_onboarding.admin.pan', 'PAN'), value: app.pan },
  ]

  return (
    <Page>
      <PageBody>
        <FormHeader
          mode="detail"
          backHref={APPLICATIONS_LIST_HREF}
          backLabel={t('dealer_onboarding.admin.title', 'Dealer applications')}
          entityTypeLabel={t('dealer_onboarding.admin.entityTypeLabel', 'Dealer application')}
          title={app.businessName}
          statusBadge={(
            <StatusBadge variant={KYC_STATUS_VARIANT[kycStatus] ?? 'neutral'} dot>
              {t(`dealer_onboarding.kycStatus.${kycStatus}`, kycStatus)}
            </StatusBadge>
          )}
          actionsContent={(
            <>
              {showReject ? (
                <Button type="button" variant="destructive" onClick={() => setRejectOpen(true)} disabled={isApproving}>
                  {t('dealer_onboarding.admin.actions.reject', 'Reject')}
                </Button>
              ) : null}
              {showApprove ? (
                <Button type="button" onClick={() => void handleApprove()} disabled={isApproving}>
                  {isApproving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                  {isApproving
                    ? t('dealer_onboarding.admin.actions.approving', 'Approving…')
                    : t('dealer_onboarding.admin.actions.approve', 'Approve')}
                </Button>
              ) : null}
            </>
          )}
        />
        {resubmitted ? (
          <Alert status="information" style="lighter" size="sm">
            <AlertDescription>
              {t(
                'dealer_onboarding.admin.resubmittedNotice',
                'This application was previously reviewed and has been resubmitted since its last rejection.',
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        {kycStatus === 'rejected' && app.rejectionReason ? (
          <Alert status="error" style="lighter" size="sm">
            <AlertDescription>
              {t('dealer_onboarding.admin.rejectionReasonLabel', 'Rejection reason')}: {app.rejectionReason}
            </AlertDescription>
          </Alert>
        ) : null}

        <section aria-labelledby="dealer-business-details-heading" className="space-y-3">
          <h2 id="dealer-business-details-heading" className="text-sm font-medium text-muted-foreground">
            {t('dealer_onboarding.admin.sections.businessDetails', 'Business details')}
          </h2>
          <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            {businessFields.map((field) => (
              <div key={field.key}>
                <dt className="text-sm text-muted-foreground">{field.label}</dt>
                <dd className="break-words">{field.value || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="dealer-kyc-documents-heading" className="space-y-3">
          <h2 id="dealer-kyc-documents-heading" className="text-sm font-medium text-muted-foreground">
            {t('dealer_onboarding.admin.sections.documents', 'KYC documents')}
          </h2>
          {app.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('dealer_onboarding.admin.documents.empty', 'No documents uploaded yet.')}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {app.documents.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div className="space-y-0.5">
                    <p className="font-medium">
                      {t(`dealer_onboarding.documentType.${doc.documentType}`, doc.documentType)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {doc.fileName} · {(doc.fileSizeBytes / 1024).toFixed(0)} KB
                      {formatTimestamp(doc.uploadedAt) ? ` · ${formatTimestamp(doc.uploadedAt)}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDownload(doc)}
                    disabled={downloadingDocumentId === doc.id}
                  >
                    {downloadingDocumentId === doc.id ? (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="size-4 mr-2" />
                    )}
                    {t('dealer_onboarding.admin.documents.download', 'Download')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageBody>
      <RejectApplicationDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        applicationId={applicationId}
        onRejected={() => {
          flash(t('dealer_onboarding.admin.rejectDialog.success', 'Application rejected'), 'success')
          refresh()
        }}
        onConflict={() => {
          flash(
            t('dealer_onboarding.admin.conflict', 'This application was already reviewed by someone else — showing the latest status.'),
            'error',
          )
          refresh()
        }}
        onForbidden={() => setAccessDenied(true)}
      />
      {ConfirmDialogElement}
    </Page>
  )
}
