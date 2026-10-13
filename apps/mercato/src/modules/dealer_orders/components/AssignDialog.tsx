'use client'

import * as React from 'react'
import { PackagePlus, Repeat } from 'lucide-react'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
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
import { DatePicker } from '@open-mercato/ui/primitives/date-picker'
import { FieldLabel } from '@open-mercato/ui/primitives/label'
import { useDialogKeyHandler } from '@open-mercato/ui/hooks/useDialogKeyHandler'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DealerPicker, type DealerOption } from './DealerPicker'
import { submitAssignOrder, submitReassignOrder, formatDateOnly } from './assignmentActions'
import { buildOperationKey, getOrCreateIdempotencyKey, releaseIdempotencyKey } from './idempotencyKeys'

export type AssignDialogMode = 'assign' | 'reassign'

/**
 * Assign/reassign dialog for the admin order-assignment tab. One component
 * for both modes since the fields largely overlap (dealer picker +
 * production-deadline date; reassign additionally offers an optional
 * reason) — mirrors the guarded-mutation, keyboard-accessible,
 * double-submit-safe pattern in
 * `dealer_onboarding/components/RejectApplicationDialog.tsx`.
 *
 * Idempotency: a key is minted (or reused, if this is a resubmit of the
 * SAME dialog session after a recoverable error) immediately before each
 * network attempt via `getOrCreateIdempotencyKey`, and released on any
 * terminal outcome (success, conflict, forbidden, or the dialog being
 * closed without success) so the next time this action is opened it is
 * genuinely a new operation. See `idempotencyKeys.ts`'s doc comment.
 *
 * Payment-status validation is deliberately NOT attempted client-side —
 * per this task's brief, `assertOrderIsPaid` on the server is the sole
 * authority; this dialog only ever surfaces its rejection (400,
 * "order not paid") clearly if/when it comes back.
 */
export function AssignDialog({
  open,
  onOpenChange,
  mode,
  orderId,
  dealers,
  dealersLoading,
  onSuccess,
  onStaleState,
  onForbidden,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: AssignDialogMode
  orderId: string
  dealers: DealerOption[]
  dealersLoading: boolean
  onSuccess: (assignmentId: string) => void
  /** Called on a 409 (assign: already assigned) or 404 (reassign: no active assignment) — the tab should refetch and show the real current state. */
  onStaleState: (message: string) => void
  onForbidden: () => void
}) {
  const t = useT()
  const [dealerProfileId, setDealerProfileId] = React.useState('')
  const [requiredBy, setRequiredBy] = React.useState<Date | null>(null)
  const [reason, setReason] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const operationKey = buildOperationKey(mode, orderId)
  const mutationContextId = `dealer-orders-${mode}:${orderId}`
  const { runMutation } = useGuardedMutation<{ orderId: string; action: string }>({ contextId: mutationContextId })

  const resetFields = React.useCallback(() => {
    setDealerProfileId('')
    setRequiredBy(null)
    setReason('')
    setFieldError(null)
  }, [])

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (!next && !isSubmitting) {
      resetFields()
      // Dialog abandoned without success — this operation is over; a future
      // open is a fresh one and should mint a fresh key.
      releaseIdempotencyKey(operationKey)
    }
    onOpenChange(next)
  }, [isSubmitting, onOpenChange, operationKey, resetFields])

  const submit = React.useCallback(async () => {
    if (isSubmitting) return
    setFieldError(null)

    const requiredByValue = requiredBy ? formatDateOnly(requiredBy) : ''
    if (!dealerProfileId) {
      setFieldError(t('dealer_orders.admin.assignDialog.error.dealerRequired', 'Select a dealer'))
      return
    }
    if (!requiredByValue) {
      setFieldError(t('dealer_orders.admin.assignDialog.error.deadlineRequired', 'Select a production deadline'))
      return
    }

    setIsSubmitting(true)
    const idempotencyKey = getOrCreateIdempotencyKey(operationKey)
    const method = mode === 'assign' ? 'POST' : 'PUT'
    const url = `/api/dealer_orders/admin/orders/${encodeURIComponent(orderId)}/assignment`

    const result = mode === 'assign'
      ? await submitAssignOrder({
        dealerProfileId,
        requiredBy: requiredByValue,
        post: async (body) => runMutation({
          operation: () => readApiResultOrThrow<{ id: string }>(
            url,
            {
              method,
              headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
              body: JSON.stringify(body),
            },
            { errorMessage: t('dealer_orders.admin.assignDialog.error.generic', 'Could not assign this order') },
          ),
          context: { orderId, action: mode },
        }),
      })
      : await submitReassignOrder({
        dealerProfileId,
        requiredBy: requiredByValue,
        reason,
        post: async (body) => runMutation({
          operation: () => readApiResultOrThrow<{ id: string }>(
            url,
            {
              method,
              headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
              body: JSON.stringify(body),
            },
            { errorMessage: t('dealer_orders.admin.assignDialog.error.generic', 'Could not reassign this order') },
          ),
          context: { orderId, action: mode },
        }),
      })

    setIsSubmitting(false)

    if (result.ok) {
      releaseIdempotencyKey(operationKey)
      resetFields()
      onOpenChange(false)
      onSuccess(result.data.id)
      return
    }

    if (result.error.code === 'conflict' || result.error.code === 'not_found') {
      releaseIdempotencyKey(operationKey)
      onOpenChange(false)
      onStaleState(result.error.message)
      return
    }
    if (result.error.code === 'forbidden') {
      releaseIdempotencyKey(operationKey)
      onOpenChange(false)
      onForbidden()
      return
    }
    // validation / order_not_paid / idempotency_key_required / request_failed:
    // keep the dialog open and the same idempotency key so a resubmit of the
    // SAME intent reuses it, per this task's idempotency requirement.
    if (result.error.code === 'order_not_paid') {
      setFieldError(result.error.message || t('dealer_orders.admin.assignDialog.error.orderNotPaid', 'This order must be paid before it can be assigned'))
      return
    }
    setFieldError(result.error.message || t('dealer_orders.admin.assignDialog.error.generic', 'Could not save this assignment'))
  }, [dealerProfileId, isSubmitting, mode, onForbidden, onOpenChange, onStaleState, onSuccess, operationKey, orderId, reason, requiredBy, resetFields, runMutation, t])

  const dialogKeyDown = useDialogKeyHandler({
    onConfirm: () => void submit(),
    onCancel: () => handleOpenChange(false),
    disabled: isSubmitting,
  })

  const tomorrow = React.useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const title = mode === 'assign'
    ? t('dealer_orders.admin.assignDialog.assignTitle', 'Assign order to a dealer')
    : t('dealer_orders.admin.assignDialog.reassignTitle', 'Reassign order to a different dealer')
  const description = mode === 'assign'
    ? t('dealer_orders.admin.assignDialog.assignDescription', 'The dealer will receive an email with the production deadline and a link to this order.')
    : t('dealer_orders.admin.assignDialog.reassignDescription', 'The current assignment will be cancelled and a new one created for the dealer you select.')
  const submitLabel = mode === 'assign'
    ? t('dealer_orders.admin.assignDialog.assignSubmit', 'Assign order')
    : t('dealer_orders.admin.assignDialog.reassignSubmit', 'Reassign order')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="default" onKeyDown={dialogKeyDown}>
        <DialogHeader leading={mode === 'assign' ? <PackagePlus className="size-5" /> : <Repeat className="size-5" />}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FieldLabel required htmlFor="dealer-order-assignment-dealer">
              {t('dealer_orders.admin.assignDialog.dealerLabel', 'Dealer')}
            </FieldLabel>
            <DealerPicker
              dealers={dealers}
              isLoading={dealersLoading}
              value={dealerProfileId}
              onChange={setDealerProfileId}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel required htmlFor="dealer-order-assignment-deadline">
              {t('dealer_orders.admin.assignDialog.deadlineLabel', 'Production deadline')}
            </FieldLabel>
            <DatePicker
              id="dealer-order-assignment-deadline"
              value={requiredBy}
              onChange={setRequiredBy}
              minDate={tomorrow}
              footer="none"
              disabled={isSubmitting}
            />
          </div>
          {mode === 'reassign' ? (
            <div className="space-y-2">
              <FieldLabel htmlFor="dealer-order-assignment-reason" sublabel={t('dealer_orders.admin.assignDialog.reasonOptional', '(optional)')}>
                {t('dealer_orders.admin.assignDialog.reasonLabel', 'Reason for reassignment')}
              </FieldLabel>
              <Textarea
                id="dealer-order-assignment-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('dealer_orders.admin.assignDialog.reasonPlaceholder', 'Why is this order being reassigned?')}
                disabled={isSubmitting}
                maxLength={500}
              />
            </div>
          ) : null}
          {fieldError ? (
            <p className="text-sm text-destructive" role="alert">{fieldError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('dealer_orders.admin.actions.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={isSubmitting}>
            {isSubmitting ? t('dealer_orders.admin.assignDialog.submitting', 'Saving…') : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
