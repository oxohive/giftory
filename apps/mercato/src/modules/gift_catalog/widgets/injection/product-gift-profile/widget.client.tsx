"use client"

import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readApiResultOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { deleteCrud } from '@open-mercato/ui/backend/utils/crud'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { CheckboxField } from '@open-mercato/ui/primitives/checkbox-field'
import { SwitchField } from '@open-mercato/ui/primitives/switch-field'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import {
  DEFAULT_GIFT_MESSAGE_MAX_LENGTH,
  GIFT_FULFILLMENT_MODES,
  GIFT_OCCASION_CODES,
  GIFT_RECIPIENT_TYPES,
  type GiftFulfillmentMode,
} from '../../../lib/constants'
import type { GiftProfileListItem } from '../../../lib/profileRows'

const API_PATH = '/api/gift_catalog/profiles'

type ProfileDraft = {
  occasions: string[]
  recipientTypes: string[]
  isCustomizable: boolean
  proofRequired: boolean
  giftWrapAvailable: boolean
  giftMessageMaxLength: string
  productionLeadTimeDays: string
  personalizationNotes: string
  fulfillmentMode: GiftFulfillmentMode
}

const EMPTY_DRAFT: ProfileDraft = {
  occasions: [],
  recipientTypes: [],
  isCustomizable: false,
  proofRequired: false,
  giftWrapAvailable: false,
  giftMessageMaxLength: String(DEFAULT_GIFT_MESSAGE_MAX_LENGTH),
  productionLeadTimeDays: '',
  personalizationNotes: '',
  fulfillmentMode: 'dealer',
}

type HostContext = {
  resourceId?: unknown
  recordId?: unknown
  operation?: unknown
}

function readProductId(context: unknown): string | null {
  const ctx = (context && typeof context === 'object' ? context : {}) as HostContext
  if (typeof ctx.resourceId === 'string' && ctx.resourceId.length > 0) return ctx.resourceId
  if (ctx.operation === 'create') return null
  if (typeof ctx.recordId === 'string' && ctx.recordId.length > 0) return ctx.recordId
  return null
}

function toDraft(profile: GiftProfileListItem | null): ProfileDraft {
  if (!profile) return EMPTY_DRAFT
  return {
    occasions: [...profile.occasions],
    recipientTypes: [...profile.recipientTypes],
    isCustomizable: profile.isCustomizable,
    proofRequired: profile.proofRequired,
    giftWrapAvailable: profile.giftWrapAvailable,
    giftMessageMaxLength: String(profile.giftMessageMaxLength),
    productionLeadTimeDays: profile.productionLeadTimeDays == null ? '' : String(profile.productionLeadTimeDays),
    personalizationNotes: profile.personalizationNotes ?? '',
    fulfillmentMode: profile.fulfillmentMode,
  }
}

function toggle(list: string[], value: string, checked: boolean): string[] {
  if (checked) return list.includes(value) ? list : [...list, value]
  return list.filter((entry) => entry !== value)
}

function parseWholeNumber(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim()
  if (!trimmed.length) return null
  if (!/^\d+$/.test(trimmed)) return 'invalid'
  return Number(trimmed)
}

function errorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

export default function ProductGiftProfileWidget({ context, disabled }: InjectionWidgetComponentProps) {
  const t = useT()
  const productId = React.useMemo(() => readProductId(context), [context])
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const { runMutation } = useGuardedMutation<{ resourceKind: string; resourceId: string | null }>({
    contextId: `gift_catalog.product-gift-profile.${productId ?? 'new'}`,
    blockedMessage: t('ui.forms.flash.saveBlocked'),
  })

  const [profile, setProfile] = React.useState<GiftProfileListItem | null>(null)
  const [draft, setDraft] = React.useState<ProfileDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      if (!productId) {
        setLoading(false)
        return
      }
      setLoading(true)
      setLoadError(null)
      try {
        const params = new URLSearchParams({ productId, page: '1', pageSize: '1' })
        const payload = await readApiResultOrThrow<{ items?: GiftProfileListItem[] }>(`${API_PATH}?${params.toString()}`)
        if (cancelled) return
        const first = Array.isArray(payload.items) && payload.items.length > 0 ? payload.items[0] : null
        setProfile(first)
        setDraft(toDraft(first))
      } catch {
        if (!cancelled) setLoadError(t('gift_catalog.widgets.productProfile.errors.load'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [productId, reloadToken, t])

  const busy = Boolean(disabled) || loading || saving

  const handleSave = React.useCallback(async () => {
    if (!productId) return
    setFieldError(null)
    const maxLength = parseWholeNumber(draft.giftMessageMaxLength)
    const leadTime = parseWholeNumber(draft.productionLeadTimeDays)
    if (maxLength === 'invalid' || maxLength === null) {
      setFieldError(t('gift_catalog.widgets.productProfile.errors.messageLength'))
      return
    }
    if (leadTime === 'invalid') {
      setFieldError(t('gift_catalog.widgets.productProfile.errors.leadTime'))
      return
    }
    const fields = {
      occasions: draft.occasions,
      recipientTypes: draft.recipientTypes,
      isCustomizable: draft.isCustomizable,
      proofRequired: draft.proofRequired,
      giftWrapAvailable: draft.giftWrapAvailable,
      giftMessageMaxLength: maxLength,
      productionLeadTimeDays: leadTime,
      personalizationNotes: draft.personalizationNotes.trim().length ? draft.personalizationNotes.trim() : null,
      fulfillmentMode: draft.fulfillmentMode,
    }
    const payload = profile ? { id: profile.id, ...fields } : { productId, ...fields }
    setSaving(true)
    try {
      await runMutation({
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(profile?.updatedAt ?? null), () =>
            readApiResultOrThrow<Record<string, unknown>>(API_PATH, {
              method: profile ? 'PUT' : 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            }),
          ),
        context: { resourceKind: 'catalog.product', resourceId: productId },
        mutationPayload: payload,
      })
      flash(t('gift_catalog.widgets.productProfile.flash.saved'), 'success')
      setReloadToken((value) => value + 1)
    } catch (err) {
      // 409 conflicts are surfaced on the shared record-conflict banner by
      // useGuardedMutation; reload so the editor shows the newer version.
      if (errorStatus(err) === 409) {
        setReloadToken((value) => value + 1)
        return
      }
      const message = err instanceof Error && err.message ? err.message : t('gift_catalog.widgets.productProfile.errors.save')
      flash(message, 'error')
    } finally {
      setSaving(false)
    }
  }, [draft, productId, profile, runMutation, t])

  const handleRemove = React.useCallback(async () => {
    if (!productId || !profile) return
    const confirmed = await confirm({
      title: t('gift_catalog.widgets.productProfile.confirmRemove.title'),
      text: t('gift_catalog.widgets.productProfile.confirmRemove.text'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setSaving(true)
    try {
      await runMutation({
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(profile.updatedAt), () =>
            deleteCrud('gift_catalog/profiles', profile.id),
          ),
        context: { resourceKind: 'catalog.product', resourceId: productId },
        mutationPayload: { id: profile.id },
      })
      flash(t('gift_catalog.widgets.productProfile.flash.removed'), 'success')
      setReloadToken((value) => value + 1)
    } catch (err) {
      if (errorStatus(err) === 409) {
        setReloadToken((value) => value + 1)
        return
      }
      const message = err instanceof Error && err.message ? err.message : t('gift_catalog.widgets.productProfile.errors.save')
      flash(message, 'error')
    } finally {
      setSaving(false)
    }
  }, [confirm, productId, profile, runMutation, t])

  if (!productId) {
    return <p className="text-sm text-muted-foreground">{t('gift_catalog.widgets.productProfile.saveProductFirst')}</p>
  }
  if (loading && !profile) return <LoadingMessage label={t('gift_catalog.widgets.productProfile.loading')} />
  if (loadError) {
    return (
      <div className="space-y-2">
        <ErrorMessage label={loadError} />
        <Button type="button" variant="outline" size="sm" onClick={() => setReloadToken((value) => value + 1)}>
          {t('gift_catalog.common.retry')}
        </Button>
      </div>
    )
  }

  const idPrefix = `gift-profile-${productId}`

  return (
    <div className="space-y-4" aria-busy={saving}>
      {!profile ? (
        <p className="text-sm text-muted-foreground">{t('gift_catalog.widgets.productProfile.empty')}</p>
      ) : null}

      <fieldset className="space-y-2" disabled={busy}>
        <legend className="text-sm font-medium text-foreground">{t('gift_catalog.fields.occasions')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {GIFT_OCCASION_CODES.map((code) => (
            <CheckboxField
              key={code}
              id={`${idPrefix}-occasion-${code}`}
              label={t(`gift_catalog.occasions.codes.${code}`)}
              checked={draft.occasions.includes(code)}
              disabled={busy}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({ ...prev, occasions: toggle(prev.occasions, code, checked === true) }))
              }
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={busy}>
        <legend className="text-sm font-medium text-foreground">{t('gift_catalog.fields.recipientTypes')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {GIFT_RECIPIENT_TYPES.map((code) => (
            <CheckboxField
              key={code}
              id={`${idPrefix}-recipient-${code}`}
              label={t(`gift_catalog.recipients.${code}`)}
              checked={draft.recipientTypes.includes(code)}
              disabled={busy}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({ ...prev, recipientTypes: toggle(prev.recipientTypes, code, checked === true) }))
              }
            />
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <SwitchField
          id={`${idPrefix}-customizable`}
          label={t('gift_catalog.fields.isCustomizable')}
          description={t('gift_catalog.fields.isCustomizable.help')}
          checked={draft.isCustomizable}
          disabled={busy}
          onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, isCustomizable: checked === true }))}
        />
        <SwitchField
          id={`${idPrefix}-proof`}
          label={t('gift_catalog.fields.proofRequired')}
          description={t('gift_catalog.fields.proofRequired.help')}
          checked={draft.proofRequired}
          disabled={busy}
          onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, proofRequired: checked === true }))}
        />
        <SwitchField
          id={`${idPrefix}-wrap`}
          label={t('gift_catalog.fields.giftWrapAvailable')}
          checked={draft.giftWrapAvailable}
          disabled={busy}
          onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, giftWrapAvailable: checked === true }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-message-length`}>{t('gift_catalog.fields.giftMessageMaxLength')}</Label>
          <Input
            id={`${idPrefix}-message-length`}
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.giftMessageMaxLength}
            disabled={busy}
            onChange={(event) => setDraft((prev) => ({ ...prev, giftMessageMaxLength: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-lead-time`}>{t('gift_catalog.fields.productionLeadTimeDays')}</Label>
          <Input
            id={`${idPrefix}-lead-time`}
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.productionLeadTimeDays}
            placeholder={t('gift_catalog.fields.productionLeadTimeDays.placeholder')}
            disabled={busy}
            onChange={(event) => setDraft((prev) => ({ ...prev, productionLeadTimeDays: event.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-fulfillment`}>{t('gift_catalog.fields.fulfillmentMode')}</Label>
        <Select
          value={draft.fulfillmentMode}
          disabled={busy}
          onValueChange={(next) =>
            setDraft((prev) => ({ ...prev, fulfillmentMode: next === 'platform' ? 'platform' : 'dealer' }))
          }
        >
          <SelectTrigger id={`${idPrefix}-fulfillment`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GIFT_FULFILLMENT_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {t(`gift_catalog.fulfillment.${mode}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-notes`}>{t('gift_catalog.fields.personalizationNotes')}</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={3}
          value={draft.personalizationNotes}
          placeholder={t('gift_catalog.fields.personalizationNotes.placeholder')}
          disabled={busy}
          onChange={(event) => setDraft((prev) => ({ ...prev, personalizationNotes: event.target.value }))}
        />
      </div>

      {fieldError ? (
        <p role="alert" className="text-sm text-status-error-text">
          {fieldError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void handleSave()} disabled={busy}>
          {saving
            ? t('gift_catalog.common.saving')
            : profile
              ? t('gift_catalog.widgets.productProfile.actions.save')
              : t('gift_catalog.widgets.productProfile.actions.create')}
        </Button>
        {profile ? (
          <Button type="button" variant="outline" onClick={() => void handleRemove()} disabled={busy}>
            {t('gift_catalog.widgets.productProfile.actions.remove')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t('gift_catalog.widgets.productProfile.independentSaveHint')}</p>
      {ConfirmDialogElement}
    </div>
  )
}
