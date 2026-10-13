"use client"

import * as React from 'react'
import { Banknote } from 'lucide-react'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { AmountInput, type AmountCurrency } from '@open-mercato/ui/primitives/amount-input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { FieldLabel } from '@open-mercato/ui/primitives/label'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { useDialogKeyHandler } from '@open-mercato/ui/hooks/useDialogKeyHandler'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { submitRecordPayout } from './ledgerActions'
import { createSubmitGuard } from './submitGuard'

const INR_CURRENCIES: AmountCurrency[] = [{ code: 'INR', symbol: '₹', label: 'Indian Rupee' }]

export function RecordPayoutDialog({
  open,
  onOpenChange,
  dealerProfileId,
  onRecorded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dealerProfileId: string
  onRecorded: () => void
}) {
  const t = useT()
  const [amountRaw, setAmountRaw] = React.useState('')
  const [note, setNote] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const guardRef = React.useRef(createSubmitGuard())
  const mutationContextId = `payouts-record-payout:${dealerProfileId}`
  const { runMutation } = useGuardedMutation<{ formId: string; resourceKind: string }>({
    contextId: mutationContextId,
    blockedMessage: t('ui.forms.flash.saveBlocked', 'Save blocked by validation'),
  })

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (!next && !guardRef.current.isRunning()) {
      setAmountRaw('')
      setNote('')
      setFieldError(null)
    }
    onOpenChange(next)
  }, [onOpenChange])

  const submit = React.useCallback(async () => {
    setFieldError(null)
    const outcome = await guardRef.current.run(() => submitRecordPayout({
      amountRaw,
      note,
      post: async (body) => {
        const call = await runMutation({
          operation: () => apiCallOrThrow<{ id: string }>(
            `/api/payouts/admin/dealers/${encodeURIComponent(dealerProfileId)}/ledger/payout`,
            { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
            { errorMessage: t('payouts.admin.recordPayoutDialog.error.generic', 'Could not record this payout') },
          ),
          context: { formId: mutationContextId, resourceKind: 'payouts.dealer_ledger_entry' },
          mutationPayload: body,
        })
        if (!call.result) throw new Error(t('payouts.admin.recordPayoutDialog.error.generic', 'Could not record this payout'))
        return call.result
      },
    }))
    if (outcome.skipped) return
    setIsSubmitting(false)
    const result = outcome.result
    if (result.ok) {
      flash(t('payouts.admin.recordPayoutDialog.success', 'Payout recorded'), 'success')
      handleOpenChange(false)
      onRecorded()
      return
    }
    if (result.error.code === 'invalid_amount') {
      setFieldError(t('payouts.admin.ledgerDialog.error.invalidAmount', 'Enter a whole or 2-decimal rupee amount greater than zero'))
      return
    }
    if (result.error.code === 'missing_note') {
      setFieldError(t('payouts.admin.recordPayoutDialog.error.missingReference', 'A payment reference is required'))
      return
    }
    // request_failed: server rejected it (validation) or the call failed outright.
    // Keep the dialog open with the entered values intact so the admin can see
    // why and decide whether to correct the input or retry.
    flash(result.error.message || t('payouts.admin.recordPayoutDialog.error.generic', 'Could not record this payout'), 'error')
  }, [amountRaw, note, dealerProfileId, mutationContextId, runMutation, t, handleOpenChange, onRecorded])

  const handleSubmitClick = React.useCallback(() => {
    if (guardRef.current.isRunning()) return
    setIsSubmitting(true)
    void submit()
  }, [submit])

  const dialogKeyDown = useDialogKeyHandler({
    onConfirm: handleSubmitClick,
    onCancel: () => handleOpenChange(false),
    disabled: isSubmitting,
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="default" onKeyDown={dialogKeyDown}>
        <DialogHeader leading={<Banknote className="size-5" />}>
          <DialogTitle>{t('payouts.admin.recordPayoutDialog.title', 'Record payout')}</DialogTitle>
          <DialogDescription>
            {t(
              'payouts.admin.recordPayoutDialog.description',
              'This only documents that a payment was already completed outside Giftory (e.g. a bank transfer). It does not send any money.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Alert status="information" style="lighter" size="sm">
            {t(
              'payouts.admin.ledgerDialog.moneyNotice',
              'Giftory has no payment disbursement integration yet. Complete the transfer in your banking system first, then record it here for the ledger.',
            )}
          </Alert>
          <div className="space-y-2">
            <FieldLabel required htmlFor="payout-amount">
              {t('payouts.admin.recordPayoutDialog.amountLabel', 'Amount paid')}
            </FieldLabel>
            <AmountInput
              id="payout-amount"
              value={{ amount: amountRaw, currency: 'INR' }}
              onChange={(next) => setAmountRaw(next.amount)}
              currencies={INR_CURRENCIES}
              showCurrency={false}
              disabled={isSubmitting}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel required htmlFor="payout-reference">
              {t('payouts.admin.recordPayoutDialog.referenceLabel', 'Payment reference')}
            </FieldLabel>
            <Textarea
              id="payout-reference"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('payouts.admin.recordPayoutDialog.referencePlaceholder', 'Bank transfer UTR, cheque number, or other proof of payment')}
              disabled={isSubmitting}
            />
          </div>
          {fieldError ? (
            <p className="text-sm text-destructive" role="alert">{fieldError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('payouts.admin.actions.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleSubmitClick} disabled={isSubmitting}>
            {isSubmitting
              ? t('payouts.admin.actions.recording', 'Recording…')
              : t('payouts.admin.recordPayoutDialog.submit', 'Record payout')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
