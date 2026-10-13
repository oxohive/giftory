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
import { submitCancelAssignment } from './assignmentActions'

/**
 * Required-reason cancel dialog, mirroring
 * `dealer_onboarding/components/RejectApplicationDialog.tsx`'s pattern.
 *
 * No `Idempotency-Key` here: per API-CONTRACTS.md, `DELETE
 * /admin/orders/{id}/assignment` is the one write route in this flow that
 * does NOT require the header.
 */
export function CancelAssignmentDialog({
  open,
  onOpenChange,
  orderId,
  onCancelled,
  onStaleState,
  onForbidden,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  onCancelled: () => void
  onStaleState: (message: string) => void
  onForbidden: () => void
}) {
  const t = useT()
  const [reason, setReason] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const mutationContextId = `dealer-orders-cancel:${orderId}`
  const { runMutation } = useGuardedMutation<{ orderId: string; action: string }>({ contextId: mutationContextId })

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
    const result = await submitCancelAssignment({
      reason,
      post: async (body) => {
        await runMutation({
          operation: () => apiCallOrThrow(
            `/api/dealer_orders/admin/orders/${encodeURIComponent(orderId)}/assignment`,
            { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
            { errorMessage: t('dealer_orders.admin.cancelDialog.error.generic', 'Could not cancel this assignment') },
          ),
          context: { orderId, action: 'cancel' },
        })
      },
    })
    setIsSubmitting(false)

    if (result.ok) {
      setReason('')
      onOpenChange(false)
      onCancelled()
      return
    }
    if (result.error.code === 'validation') {
      setFieldError(t('dealer_orders.admin.cancelDialog.error.reasonRequired', 'A reason is required'))
      return
    }
    if (result.error.code === 'not_found' || result.error.code === 'conflict') {
      onOpenChange(false)
      onStaleState(result.error.message)
      return
    }
    if (result.error.code === 'forbidden') {
      onOpenChange(false)
      onForbidden()
      return
    }
    setFieldError(result.error.message || t('dealer_orders.admin.cancelDialog.error.generic', 'Could not cancel this assignment'))
  }, [isSubmitting, onCancelled, onForbidden, onOpenChange, onStaleState, orderId, reason, runMutation, t])

  const dialogKeyDown = useDialogKeyHandler({
    onConfirm: () => void submit(),
    onCancel: () => handleOpenChange(false),
    disabled: isSubmitting,
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="default" onKeyDown={dialogKeyDown}>
        <DialogHeader leading={<XCircle className="size-5" />} leadingTone="error">
          <DialogTitle>{t('dealer_orders.admin.cancelDialog.title', 'Cancel this assignment')}</DialogTitle>
          <DialogDescription>
            {t(
              'dealer_orders.admin.cancelDialog.description',
              'The dealer will no longer see this order. This cannot be undone — assign the order again afterward if needed.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FieldLabel required htmlFor="dealer-order-assignment-cancel-reason">
              {t('dealer_orders.admin.cancelDialog.reasonLabel', 'Reason')}
            </FieldLabel>
            <Textarea
              id="dealer-order-assignment-cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('dealer_orders.admin.cancelDialog.reasonPlaceholder', 'Why is this assignment being cancelled?')}
              disabled={isSubmitting}
              maxLength={500}
              autoFocus
            />
          </div>
          {fieldError ? (
            <p className="text-sm text-destructive" role="alert">{fieldError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('dealer_orders.admin.actions.keepAssignment', "Don't cancel")}
          </Button>
          <Button type="button" variant="destructive-solid" onClick={() => void submit()} disabled={isSubmitting}>
            {isSubmitting
              ? t('dealer_orders.admin.cancelDialog.submitting', 'Cancelling…')
              : t('dealer_orders.admin.cancelDialog.submit', 'Cancel assignment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
