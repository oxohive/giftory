'use client'

import * as React from 'react'
import { XCircle } from 'lucide-react'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { FieldLabel } from '@open-mercato/ui/primitives/label'
import { useDialogKeyHandler } from '@open-mercato/ui/hooks/useDialogKeyHandler'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { submitRejectApplication } from './reviewActions'

/**
 * Required-reason reject dialog for one dealer application. Mirrors the
 * `CreateAdjustmentDialog`/`RecordPayoutDialog` pattern in
 * `payouts/components` for a dialog guarded against a double submit
 * (`isSubmitting` disables both buttons; the mutation only ever runs once
 * per click) and keyboard-accessible (Cmd/Ctrl+Enter submits, Escape
 * cancels, via the shared `useDialogKeyHandler`).
 */
export function RejectApplicationDialog({
  open,
  onOpenChange,
  applicationId,
  onRejected,
  onConflict,
  onForbidden,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationId: string
  onRejected: () => void
  onConflict: () => void
  onForbidden: () => void
}) {
  const t = useT()
  const [reason, setReason] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const mutationContextId = `dealer-onboarding-reject:${applicationId}`
  const { runMutation } = useGuardedMutation<{ applicationId: string; action: string }>({ contextId: mutationContextId })

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (!next && !isSubmitting) {
      setReason('')
      setFieldError(null)
    }
    onOpenChange(next)
  }, [isSubmitting, onOpenChange])

  const submit = React.useCallback(async () => {
    if (isSubmitting) return
    setFieldError(null)
    setIsSubmitting(true)
    const result = await submitRejectApplication({
      reason,
      post: async (body) => {
        await runMutation({
          operation: () => apiCallOrThrow(
            `/api/dealer_onboarding/admin/dealers/applications/${encodeURIComponent(applicationId)}/reject`,
            { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
            { errorMessage: t('dealer_onboarding.admin.rejectDialog.error.generic', 'Could not reject this application') },
          ),
          context: { applicationId, action: 'reject' },
        })
      },
    })
    setIsSubmitting(false)

    if (result.ok) {
      handleOpenChange(false)
      onRejected()
      return
    }
    if (result.error.code === 'missing_reason') {
      setFieldError(t('dealer_onboarding.admin.rejectDialog.error.missingReason', 'A reason is required'))
      return
    }
    if (result.error.code === 'conflict') {
      handleOpenChange(false)
      onConflict()
      return
    }
    if (result.error.code === 'forbidden') {
      handleOpenChange(false)
      onForbidden()
      return
    }
    setFieldError(result.error.message || t('dealer_onboarding.admin.rejectDialog.error.generic', 'Could not reject this application'))
  }, [applicationId, handleOpenChange, isSubmitting, onConflict, onForbidden, onRejected, reason, runMutation, t])

  const dialogKeyDown = useDialogKeyHandler({
    onConfirm: () => void submit(),
    onCancel: () => handleOpenChange(false),
    disabled: isSubmitting,
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="default" onKeyDown={dialogKeyDown}>
        <DialogHeader leading={<XCircle className="size-5" />}>
          <DialogTitle>{t('dealer_onboarding.admin.rejectDialog.title', 'Reject this application')}</DialogTitle>
          <DialogDescription>
            {t(
              'dealer_onboarding.admin.rejectDialog.description',
              'The dealer will receive an email with this reason and can log in to review and resubmit their application.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FieldLabel required htmlFor="reject-reason">
              {t('dealer_onboarding.admin.rejectDialog.reasonLabel', 'Reason')}
            </FieldLabel>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('dealer_onboarding.admin.rejectDialog.reasonPlaceholder', 'Why is this application being rejected?')}
              disabled={isSubmitting}
              autoFocus
            />
          </div>
          {fieldError ? (
            <p className="text-sm text-destructive" role="alert">{fieldError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('dealer_onboarding.admin.actions.cancel', 'Cancel')}
          </Button>
          <Button type="button" variant="destructive-solid" onClick={() => void submit()} disabled={isSubmitting}>
            {isSubmitting
              ? t('dealer_onboarding.admin.actions.rejecting', 'Rejecting…')
              : t('dealer_onboarding.admin.rejectDialog.submit', 'Reject application')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
