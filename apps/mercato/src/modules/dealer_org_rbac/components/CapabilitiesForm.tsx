"use client"

import * as React from 'react'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { FieldLabel } from '@open-mercato/ui/primitives/label'
import { TagsInput } from '@open-mercato/ui/backend/inputs/TagsInput'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { useDialogKeyHandler } from '@open-mercato/ui/hooks/useDialogKeyHandler'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PRINTING_METHODS, INDIAN_STATE_CODES } from '../lib/constants'
import { capabilitiesUpsertSchema } from '../data/validators'
import { buildCapabilitiesPayload, type CapabilitiesFormValues } from './capabilitiesPayload'
import { mapCapabilitiesSaveError, type CapabilitiesSaveError } from './capabilitiesErrors'

export type DealerCapabilitiesWire = {
  id?: string
  productTypeCodes: string[]
  printingMethods: string[]
  maxDailyCapacity: number
  serviceableStates: string[]
  minOrderQty: number
  updatedAt: string | null
}

function toFormValues(capabilities: DealerCapabilitiesWire): CapabilitiesFormValues {
  return {
    productTypeCodes: capabilities.productTypeCodes,
    printingMethods: capabilities.printingMethods,
    maxDailyCapacity: capabilities.maxDailyCapacity,
    serviceableStates: capabilities.serviceableStates,
    minOrderQty: capabilities.minOrderQty,
  }
}

/**
 * Capability configuration editor for an approved dealer
 * (`PUT /api/dealer_org_rbac/admin/dealers/{id}/capabilities`).
 *
 * `printingMethods` and `serviceableStates` are rendered as closed
 * `TagsInput`s (`allowCustomValues={false}`) sourced directly from this
 * module's own `PRINTING_METHODS`/`INDIAN_STATE_CODES` constants — the
 * same enums `data/validators.ts`'s `capabilitiesUpsertSchema` validates
 * against, read from that file, not re-typed here. `productTypeCodes` is
 * rendered as an open `TagsInput` (`allowCustomValues={true}`, no
 * `suggestions`): per this task's own instruction and the already-confirmed
 * finding that `dealer_capabilities.productTypeCodes` is genuinely
 * free text with no canonical registry anywhere in this schema, this is
 * deliberately a plain tag/free-text field, never a dropdown backed by a
 * guessed list of product types.
 *
 * Before sending anything over the wire, the built payload is run back
 * through the real `capabilitiesUpsertSchema` client-side — this can only
 * ever reject a payload the server would also reject (same schema, same
 * file), so it exists purely to give the admin instant, specific feedback
 * without a round trip; the server call remains the only source of truth.
 *
 * On success, this component does NOT update its own displayed values from
 * the submitted payload — it calls `onSaved()` and lets the parent refetch
 * the dealer detail from the server, so what's on screen after a save is
 * always what the server actually persisted, never an optimistic echo of
 * what was submitted (acceptance: "reload the page to see it persisted").
 */
export function CapabilitiesForm({
  dealerProfileId,
  capabilities,
  canManage,
  onSaved,
}: {
  dealerProfileId: string
  capabilities: DealerCapabilitiesWire
  canManage: boolean
  onSaved: () => void
}) {
  const t = useT()
  const [values, setValues] = React.useState<CapabilitiesFormValues>(() => toFormValues(capabilities))
  const [saveError, setSaveError] = React.useState<CapabilitiesSaveError | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Re-sync local edit state whenever the server-backed `capabilities` prop
  // changes — a successful save (parent refetches), an admin reloading the
  // page, or a reload-and-retry after a 409 all flow through here, never
  // through a locally-held "optimistic" copy.
  React.useEffect(() => {
    setValues(toFormValues(capabilities))
    setSaveError(null)
  }, [capabilities])

  const mutationContextId = `dealer_org_rbac-admin-capabilities:${dealerProfileId}`
  const { runMutation } = useGuardedMutation<{ formId: string; resourceKind: string }>({
    contextId: mutationContextId,
    blockedMessage: t('ui.forms.flash.saveBlocked', 'Save blocked by validation'),
  })

  const printingMethodOptions = React.useMemo(
    () => PRINTING_METHODS.map((value) => ({ value, label: t(`dealer_org.printingMethods.${value}`, value) })),
    [t],
  )
  const serviceableStateOptions = React.useMemo(
    () => INDIAN_STATE_CODES.map((value) => ({ value, label: value })),
    [],
  )

  const submit = React.useCallback(async (): Promise<boolean> => {
    setSaveError(null)
    const lastUpdatedAt = capabilities.updatedAt
    const payload = buildCapabilitiesPayload(values, lastUpdatedAt)

    // Client-side pre-check against the REAL server schema — never a
    // hand-mirrored copy — so an out-of-range number or a stray value gets
    // a specific message before any network round trip.
    const preCheck = capabilitiesUpsertSchema.safeParse(payload)
    if (!preCheck.success) {
      setSaveError({
        kind: 'validation',
        message: t('dealer_org_rbac.admin.capabilities.error.validation', 'Some values are invalid'),
        details: preCheck.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      })
      return false
    }

    try {
      // `runMutation` either resolves with the operation's result or
      // throws — it does not return an ok/error discriminant itself (see
      // `@open-mercato/ui`'s `useGuardedMutation`), so success/failure is
      // handled with try/catch here, not a result flag.
      await runMutation({
        operation: () => apiCallOrThrow<DealerCapabilitiesWire>(
          `/api/dealer_org_rbac/admin/dealers/${encodeURIComponent(dealerProfileId)}/capabilities`,
          { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
          { errorMessage: t('dealer_org_rbac.admin.capabilities.error.generic', 'Could not save capability changes') },
        ),
        context: { formId: mutationContextId, resourceKind: 'dealer_org_rbac.dealer_capability' },
        mutationPayload: payload,
      })
    } catch (err) {
      setSaveError(mapCapabilitiesSaveError(err, t('dealer_org_rbac.admin.capabilities.error.generic', 'Could not save capability changes')))
      return false
    }

    flash(t('dealer_org_rbac.admin.capabilities.success', 'Capabilities saved'), 'success')
    onSaved()
    return true
  }, [capabilities.updatedAt, dealerProfileId, mutationContextId, onSaved, runMutation, t, values])

  const handleSubmitClick = React.useCallback(() => {
    if (!canManage || isSubmitting) return
    setIsSubmitting(true)
    void submit().finally(() => setIsSubmitting(false))
  }, [canManage, isSubmitting, submit])

  // Cmd/Ctrl+Enter submits, mirroring the repo-wide dialog shortcut
  // convention even though this is an inline form section, not a dialog —
  // there's no "cancel" action here to wire Escape to.
  const dialogKeyDown = useDialogKeyHandler({
    onConfirm: handleSubmitClick,
    disabled: isSubmitting || !canManage,
  })

  const fieldsDisabled = isSubmitting || !canManage

  return (
    <div className="space-y-4" onKeyDown={dialogKeyDown}>
      {!canManage ? (
        <Alert status="information" style="lighter">
          <AlertDescription>
            {t('dealer_org_rbac.admin.capabilities.readOnlyNotice', 'You can view this dealer\'s capability configuration but do not have permission to change it.')}
          </AlertDescription>
        </Alert>
      ) : null}

      {saveError ? (
        <Alert status={saveError.kind === 'conflict' ? 'warning' : 'error'} style="lighter">
          <AlertDescription>
            <p role="alert">{saveError.message}</p>
            {saveError.kind === 'conflict' ? (
              <p className="mt-1 text-sm">
                {t('dealer_org_rbac.admin.capabilities.error.conflictHint', 'Reload this dealer\'s capabilities to see the latest values, then try your change again.')}
              </p>
            ) : null}
            {saveError.details?.length ? (
              <ul className="mt-1 list-disc pl-5 text-sm">
                {saveError.details.map((detail, index) => (
                  <li key={`${detail.path}-${index}`}>{detail.path ? `${detail.path}: ${detail.message}` : detail.message}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <FieldLabel htmlFor="dealer-capabilities-product-types" sublabel={t('dealer_org_rbac.admin.capabilities.productTypeCodes.sublabel', 'Free text — no fixed catalog yet')}>
          {t('dealer_org_rbac.admin.capabilities.productTypeCodes.label', 'Product types')}
        </FieldLabel>
        <TagsInput
          value={values.productTypeCodes}
          onChange={(next) => setValues((prev) => ({ ...prev, productTypeCodes: next }))}
          placeholder={t('dealer_org_rbac.admin.capabilities.productTypeCodes.placeholder', 'Add a product type and press Enter')}
          allowCustomValues
          disabled={fieldsDisabled}
        />
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="dealer-capabilities-printing-methods">
          {t('dealer_org_rbac.admin.capabilities.printingMethods.label', 'Printing methods')}
        </FieldLabel>
        <TagsInput
          value={values.printingMethods}
          onChange={(next) => setValues((prev) => ({ ...prev, printingMethods: next }))}
          placeholder={t('dealer_org_rbac.admin.capabilities.printingMethods.placeholder', 'Select a printing method')}
          suggestions={printingMethodOptions}
          allowCustomValues={false}
          disabled={fieldsDisabled}
        />
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="dealer-capabilities-serviceable-states">
          {t('dealer_org_rbac.admin.capabilities.serviceableStates.label', 'Serviceable states')}
        </FieldLabel>
        <TagsInput
          value={values.serviceableStates}
          onChange={(next) => setValues((prev) => ({ ...prev, serviceableStates: next }))}
          placeholder={t('dealer_org_rbac.admin.capabilities.serviceableStates.placeholder', 'Select a state')}
          suggestions={serviceableStateOptions}
          allowCustomValues={false}
          disabled={fieldsDisabled}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel htmlFor="dealer-capabilities-max-daily-capacity">
            {t('dealer_org_rbac.admin.capabilities.maxDailyCapacity.label', 'Max daily capacity')}
          </FieldLabel>
          <Input
            id="dealer-capabilities-max-daily-capacity"
            type="number"
            min={0}
            max={100000}
            value={values.maxDailyCapacity}
            onChange={(event) => setValues((prev) => ({ ...prev, maxDailyCapacity: Number(event.target.value) }))}
            disabled={fieldsDisabled}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="dealer-capabilities-min-order-qty">
            {t('dealer_org_rbac.admin.capabilities.minOrderQty.label', 'Minimum order quantity')}
          </FieldLabel>
          <Input
            id="dealer-capabilities-min-order-qty"
            type="number"
            min={1}
            max={10000}
            value={values.minOrderQty}
            onChange={(event) => setValues((prev) => ({ ...prev, minOrderQty: Number(event.target.value) }))}
            disabled={fieldsDisabled}
          />
        </div>
      </div>

      {canManage ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setValues(toFormValues(capabilities))} disabled={fieldsDisabled}>
            {t('dealer_org_rbac.admin.capabilities.actions.reset', 'Reset')}
          </Button>
          <Button type="button" onClick={handleSubmitClick} disabled={fieldsDisabled}>
            {isSubmitting
              ? t('dealer_org_rbac.admin.capabilities.actions.saving', 'Saving…')
              : t('dealer_org_rbac.admin.capabilities.actions.save', 'Save capabilities')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
