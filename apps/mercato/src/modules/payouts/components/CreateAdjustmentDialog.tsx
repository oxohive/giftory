"use client"

import * as React from 'react'
import { Scale } from 'lucide-react'
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
import { RadioGroup } from '@open-mercato/ui/primitives/radio'
import { RadioField } from '@open-mercato/ui/primitives/radio-field'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { useDialogKeyHandler } from '@open-mercato/ui/hooks/useDialogKeyHandler'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { submitCreateAdjustment } from './ledgerActions'
import { createSubmitGuard } from './submitGuard'

const INR_CURRENCIES: AmountCurrency[] = [{ code: 'INR', symbol: '₹', label: 'Indian Rupee' }]

export function CreateAdjustmentDialog({
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
  const [direction, setDirection] = React.useState<'credit' | 'debit'>('credit')
  const [amountRaw, setAmountRaw] = React.useState('')
  const [note, setNote] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const guardRef = React.useRef(createSubmitGuard())
  const mutationContextId = `payouts-create-adjustment:${dealerProfileId}`
  const { runMutation } = useGuardedMutation<{ formId: string; resourceKind: string }>({
    contextId: mutationContextId,
    blockedMessage: t('ui.forms.flash.saveBlocked', 'Save blocked by validation'),
  })

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (!next && !guardRef.current.isRunning()) {
      setAmountRaw('')
      setNote('')
      setDirection('credit')
      setFieldError(null)
    }
    onOpenChange(next)
  }, [onOpenChange])

  const submit = React.useCallback(async () => {
    setFieldError(null)
    const outcome = await guardRef.current.run(() => submitCreateAdjustment({
      direction,
      amountRaw,
      note,
      post: async (body) => {
        const call = await runMutation({
          operation: () => apiCallOrThrow<{ id: string }>(
            `/api/payouts/admin/dealers/${encodeURIComponent(dealerProfileId)}/ledger/adjustment`,
            { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
            { errorMessage: t('payouts.admin.adjustmentDialog.error.generic', 'Could not create this adjustment') },
          ),
          context: { formId: mutationContextId, resourceKind: 'payouts.dealer_ledger_entry' },
          mutationPayload: body,
        })
        if (!call.result) throw new Error(t('payouts.admin.adjustmentDialog.error.generic', 'Could not create this adjustment'))
        return call.result
      },
    }))
    if (outcome.skipped) return
    setIsSubmitting(false)
    const result = outcome.result
    if (result.ok) {
      flash(t('payouts.admin.adjustmentDialog.success', 'Adjustment recorded'), 'success')
      handleOpenChange(false)
      onRecorded()
      return
    }
    if (result.error.code === 'invalid_amount') {
      setFieldError(t('payouts.admin.ledgerDialog.error.invalidAmount', 'Enter a whole or 2-decimal rupee amount greater than zero'))
      return
    }
    if (result.error.code === 'missing_note') {
      setFieldError(t('payouts.admin.adjustmentDialog.error.missingReason', 'A reason is required for every adjustment'))
      return
    }
    flash(result.error.message || t('payouts.admin.adjustmentDialog.error.generic', 'Could not create this adjustment'), 'error')
  }, [amountRaw, direction, note, dealerProfileId, mutationContextId, runMutation, t, handleOpenChange, onRecorded])

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
        <DialogHeader leading={<Scale className="size-5" />}>
          <DialogTitle>{t('payouts.admin.adjustmentDialog.title', 'Add ledger adjustment')}</DialogTitle>
          <DialogDescription>
            {t(
              'payouts.admin.adjustmentDialog.description',
              'Use this to correct the ledger — e.g. a reversed commission or a manual credit. This never edits or removes an existing entry; it always appends a new one.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Alert status="warning" style="lighter" size="sm">
            {t(
              'payouts.admin.ledgerDialog.moneyNotice',
              'Giftory has no payment disbursement integration yet. Complete the transfer in your banking system first, then record it here for the ledger.',
            )}
          </Alert>
          <div className="space-y-2">
            <FieldLabel required>{t('payouts.admin.adjustmentDialog.directionLabel', 'Direction')}</FieldLabel>
            <RadioGroup
              value={direction}
              onValueChange={(value) => setDirection(value === 'debit' ? 'debit' : 'credit')}
              className="flex flex-col gap-2"
            >
              <RadioField
                value="credit"
                label={t('payouts.admin.adjustmentDialog.directionCredit', 'Credit — increases the dealer\'s pending balance')}
                disabled={isSubmitting}
              />
              <RadioField
                value="debit"
                label={t('payouts.admin.adjustmentDialog.directionDebit', 'Debit — decreases the dealer\'s pending balance')}
                disabled={isSubmitting}
              />
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <FieldLabel required htmlFor="adjustment-amount">
              {t('payouts.admin.adjustmentDialog.amountLabel', 'Amount')}
            </FieldLabel>
            <AmountInput
              id="adjustment-amount"
              value={{ amount: amountRaw, currency: 'INR' }}
              onChange={(next) => setAmountRaw(next.amount)}
              currencies={INR_CURRENCIES}
              showCurrency={false}
              disabled={isSubmitting}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel required htmlFor="adjustment-reason">
              {t('payouts.admin.adjustmentDialog.reasonLabel', 'Reason')}
            </FieldLabel>
            <Textarea
              id="adjustment-reason"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('payouts.admin.adjustmentDialog.reasonPlaceholder', 'Why is this adjustment needed?')}
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
              : t('payouts.admin.adjustmentDialog.submit', 'Add adjustment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
