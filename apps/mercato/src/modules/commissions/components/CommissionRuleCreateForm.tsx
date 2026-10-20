"use client"

import * as React from 'react'
import type { z } from 'zod'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MIN_RATE_BPS, MAX_RATE_BPS } from './money'
import { loadDealerOptions } from './dealerLookup'
import { RuleScopePreview } from './RuleScopePreview'
import { commissionRuleClientFormSchema } from './ruleFormSchema'

const API_PATH = 'commissions/admin/commission/rules'
const LIST_HREF = '/backend/commission-rules'
const ENTITY_ID = 'commissions:commission_rule'

type Translate = ReturnType<typeof useT>

export type CommissionRuleFormValues = {
  dealerProfileId: string
  productTypeCode: string
  rateBps: number | string
  effectiveFrom: string
}

function useRuleFields(t: Translate): CrudField[] {
  return React.useMemo<CrudField[]>(() => [
    {
      id: 'dealerProfileId',
      label: t('commissions.admin.rules.form.fields.dealer', 'Dealer'),
      type: 'combobox',
      allowCustomValues: false,
      loadOptions: loadDealerOptions,
      description: t(
        'commissions.admin.rules.form.fields.dealer.help',
        'Leave empty to create a platform-wide default that applies to every dealer with no more specific rule.',
      ),
    },
    {
      id: 'productTypeCode',
      label: t('commissions.admin.rules.form.fields.productType', 'Product type code'),
      type: 'text',
      description: t(
        'commissions.admin.rules.form.fields.productType.help',
        'Optional. Scopes the rule to one product type for the selected dealer. Requires a dealer — a product-type rule cannot apply to "all dealers".',
      ),
      placeholder: 'personalized-mugs',
    },
    {
      id: 'rateBps',
      label: t('commissions.admin.rules.form.fields.rateBps', 'Rate (basis points)'),
      type: 'number',
      required: true,
      description: t(
        'commissions.admin.rules.form.fields.rateBps.help',
        `Between ${MIN_RATE_BPS} and ${MAX_RATE_BPS} bps. 100 bps = 1%; ${MAX_RATE_BPS} bps = 100%.`,
      ),
      placeholder: '250',
    },
    {
      id: 'effectiveFrom',
      label: t('commissions.admin.rules.form.fields.effectiveFrom', 'Effective from'),
      type: 'date',
      required: true,
      description: t(
        'commissions.admin.rules.form.fields.effectiveFrom.help',
        'The rule applies to orders assigned on or after this date. When more than one rule in the same scope could match, the one with the latest effective-from date wins.',
      ),
    },
  ], [t])
}

function useRuleGroups(t: Translate): CrudFormGroup[] {
  return React.useMemo<CrudFormGroup[]>(() => [
    {
      id: 'scope',
      title: t('commissions.admin.rules.form.groups.scope', 'Rule scope and rate'),
      column: 1,
      fields: ['dealerProfileId', 'productTypeCode', 'rateBps', 'effectiveFrom'],
    },
    {
      id: 'preview',
      title: t('commissions.admin.rules.form.groups.preview', 'Preview'),
      column: 2,
      fields: [],
      component: ({ values }) => <RuleScopePreview values={values} />,
    },
  ], [t])
}

function toPayload(values: CommissionRuleFormValues) {
  const rateBps = Number(values.rateBps)
  return {
    dealerProfileId: values.dealerProfileId && values.dealerProfileId.length ? values.dealerProfileId : null,
    productTypeCode: values.productTypeCode && values.productTypeCode.trim().length ? values.productTypeCode.trim() : null,
    rateBps: Number.isFinite(rateBps) ? Math.trunc(rateBps) : 0,
    effectiveFrom: values.effectiveFrom,
  }
}

export function CommissionRuleCreateForm() {
  const t = useT()
  const fields = useRuleFields(t)
  const groups = useRuleGroups(t)
  const successRedirect = React.useMemo(
    () => withFlash(LIST_HREF, t('commissions.admin.rules.flash.created', 'Commission rule created'), 'success'),
    [t],
  )
  const initialValues = React.useMemo<CommissionRuleFormValues>(() => ({
    dealerProfileId: '',
    productTypeCode: '',
    rateBps: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
  }), [])

  return (
    <CrudForm<CommissionRuleFormValues>
      title={t('commissions.admin.rules.form.create.title', 'Create commission rule')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      entityId={ENTITY_ID}
      schema={commissionRuleClientFormSchema as unknown as z.ZodType<CommissionRuleFormValues>}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('commissions.admin.rules.form.create.submit', 'Create rule')}
      cancelHref={LIST_HREF}
      successRedirect={successRedirect}
      // Rules are append-only — there is no update/delete route on this
      // entity (deactivation is its own DELETE-as-soft-close endpoint,
      // wired as a row action in the list, not a CrudForm edit flow).
      disableOptimisticLock
      onSubmit={async (values) => {
        await createCrud(API_PATH, toPayload(values))
      }}
    />
  )
}
