"use client"
import * as React from 'react'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { GiftOccasionListItem } from '../lib/profileRows'

const API_PATH = 'gift_catalog/occasions'
const LIST_HREF = '/backend/gift-occasions'
const ENTITY_ID = 'gift_catalog:gift_occasion'

type Translate = ReturnType<typeof useT>

export type OccasionFormValues = {
  id?: string
  code: string
  label: string
  description: string
  sortOrder: number | string
  isActive: boolean
  imageUrl: string
  // Optimistic-lock version: CrudForm derives the expected-version header from it.
  updatedAt?: string | null
}

function useOccasionFields(t: Translate, mode: 'create' | 'edit'): CrudField[] {
  return React.useMemo<CrudField[]>(() => [
    {
      id: 'label',
      label: t('gift_catalog.occasions.form.fields.label'),
      type: 'text',
      required: true,
      placeholder: t('gift_catalog.occasions.form.fields.label.placeholder'),
    },
    {
      id: 'code',
      label: t('gift_catalog.occasions.form.fields.code'),
      type: 'text',
      required: true,
      description: mode === 'edit'
        ? t('gift_catalog.occasions.form.fields.code.editHelp')
        : t('gift_catalog.occasions.form.fields.code.help'),
      placeholder: 'birthday',
    },
    {
      id: 'description',
      label: t('gift_catalog.occasions.form.fields.description'),
      type: 'textarea',
    },
    {
      id: 'imageUrl',
      label: t('gift_catalog.occasions.form.fields.imageUrl'),
      type: 'text',
      description: t('gift_catalog.occasions.form.fields.imageUrl.help'),
      placeholder: 'https://',
    },
    {
      id: 'sortOrder',
      label: t('gift_catalog.occasions.form.fields.sortOrder'),
      type: 'number',
      description: t('gift_catalog.occasions.form.fields.sortOrder.help'),
    },
    { id: 'isActive', label: t('gift_catalog.occasions.form.fields.isActive'), type: 'checkbox' },
  ], [mode, t])
}

function useOccasionGroups(t: Translate): CrudFormGroup[] {
  return React.useMemo<CrudFormGroup[]>(() => [
    { id: 'details', title: t('gift_catalog.occasions.form.groups.details'), column: 1, fields: ['label', 'code', 'description', 'imageUrl'] },
    { id: 'display', title: t('gift_catalog.occasions.form.groups.display'), column: 2, fields: ['sortOrder', 'isActive'] },
  ], [t])
}

function toPayload(values: OccasionFormValues) {
  const sortOrder = Number(values.sortOrder)
  return {
    code: String(values.code ?? '').trim(),
    label: String(values.label ?? '').trim(),
    description: values.description && values.description.trim().length ? values.description.trim() : null,
    sortOrder: Number.isFinite(sortOrder) ? Math.max(0, Math.trunc(sortOrder)) : 0,
    isActive: Boolean(values.isActive),
    imageUrl: values.imageUrl && values.imageUrl.trim().length ? values.imageUrl.trim() : null,
  }
}

export function toOccasionFormValues(item: GiftOccasionListItem): OccasionFormValues {
  return {
    id: item.id,
    code: item.code,
    label: item.label,
    description: item.description ?? '',
    sortOrder: item.sortOrder,
    isActive: item.isActive,
    imageUrl: item.imageUrl ?? '',
    updatedAt: item.updatedAt ?? null,
  }
}

export function OccasionCreateForm() {
  const t = useT()
  const fields = useOccasionFields(t, 'create')
  const groups = useOccasionGroups(t)
  const successRedirect = React.useMemo(
    () => withFlash(LIST_HREF, t('gift_catalog.occasions.flash.created'), 'success'),
    [t],
  )
  const initialValues = React.useMemo<OccasionFormValues>(() => ({
    code: '',
    label: '',
    description: '',
    sortOrder: 0,
    isActive: true,
    imageUrl: '',
  }), [])

  return (
    <CrudForm<OccasionFormValues>
      title={t('gift_catalog.occasions.form.create.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('gift_catalog.occasions.form.create.submit')}
      cancelHref={LIST_HREF}
      successRedirect={successRedirect}
      onSubmit={async (values) => {
        await createCrud(API_PATH, toPayload(values))
      }}
    />
  )
}

export function OccasionEditForm({ id }: { id: string }) {
  const t = useT()
  const fields = useOccasionFields(t, 'edit')
  const groups = useOccasionGroups(t)
  const [initial, setInitial] = React.useState<OccasionFormValues | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notFound, setNotFound] = React.useState(false)
  const successRedirect = React.useMemo(
    () => withFlash(LIST_HREF, t('gift_catalog.occasions.flash.saved'), 'success'),
    [t],
  )
  const deleteRedirect = React.useMemo(
    () => withFlash(LIST_HREF, t('gift_catalog.occasions.flash.deleted'), 'success'),
    [t],
  )

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setNotFound(false)
      try {
        const data = await fetchCrudList<GiftOccasionListItem>(API_PATH, { ids: id, pageSize: 1 })
        const item = data?.items?.[0]
        if (cancelled) return
        if (!item) {
          setNotFound(true)
          return
        }
        setInitial(toOccasionFormValues(item))
      } catch (err) {
        if (cancelled) return
        if ((err as { status?: number }).status === 404) setNotFound(true)
        else setError(t('gift_catalog.occasions.errors.load'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, t])

  const fallback = React.useMemo<OccasionFormValues>(() => ({
    id,
    code: '',
    label: '',
    description: '',
    sortOrder: 0,
    isActive: true,
    imageUrl: '',
    updatedAt: null,
  }), [id])

  if (notFound) {
    return (
      <RecordNotFoundState
        label={t('gift_catalog.occasions.errors.notFound')}
        backHref={LIST_HREF}
        backLabel={t('gift_catalog.occasions.actions.backToList')}
      />
    )
  }
  if (error) return <ErrorMessage label={error} />

  return (
    <CrudForm<OccasionFormValues>
      title={t('gift_catalog.occasions.form.edit.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initial ?? fallback}
      submitLabel={t('gift_catalog.occasions.form.edit.submit')}
      cancelHref={LIST_HREF}
      successRedirect={successRedirect}
      deleteRedirect={deleteRedirect}
      isLoading={loading}
      loadingMessage={t('gift_catalog.occasions.form.loading')}
      onSubmit={async (values) => {
        await updateCrud(API_PATH, { id, ...toPayload(values) })
      }}
      onDelete={async () => {
        await deleteCrud(API_PATH, id)
      }}
    />
  )
}
