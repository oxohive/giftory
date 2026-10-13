"use client"

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { formatBps, formatPaise, previewCommissionAmount, EXAMPLE_SUBTOTAL_PAISE, MIN_RATE_BPS, MAX_RATE_BPS } from './money'
import { classifyRuleScope, pickEffectiveRule, type RuleLike } from './ruleScope'

const RULES_API_PATH = 'commissions/admin/commission/rules'

type RulesResponse = { items: RuleLike[]; total: number }

export type RuleScopePreviewValues = {
  dealerProfileId?: string | null
  productTypeCode?: string | null
  rateBps?: number | string | null
}

/**
 * Rendered inside the create-rule form as a bare `CrudFormGroup.component`
 * (reads the live form `values`, per `CrudForm`'s group-component contract)
 * so the admin sees, as they type:
 *
 *  1. The rate converted from bps to a percentage and to a concrete rupee
 *     amount on an example subtotal — makes the bps→currency conversion
 *     concrete rather than abstract (this task's acceptance requirement).
 *  2. Whether this exact (dealer, productType) scope already has an
 *     active rule, and if so, that the NEW rule's `effectiveFrom` decides
 *     the winner (newest wins) — satisfying API-CONTRACTS.md's explicit
 *     note that TASK-15's create form "should at minimum show existing
 *     rules for the same dealer/productType scope so the admin can see an
 *     overlap before saving," since the backend has no server-side
 *     overlap guard at all.
 *  3. A warning when the chosen scope (platform-wide + a product type) can
 *     never be matched by the resolver — see `ruleScope.ts`.
 */
export function RuleScopePreview({ values }: { values: Record<string, unknown> }) {
  const t = useT()
  const v = values as RuleScopePreviewValues
  const dealerProfileId = typeof v.dealerProfileId === 'string' && v.dealerProfileId.length ? v.dealerProfileId : null
  const productTypeCode = typeof v.productTypeCode === 'string' && v.productTypeCode.trim().length ? v.productTypeCode.trim() : null
  const rateBpsRaw = Number(v.rateBps)
  const rateBps = Number.isFinite(rateBpsRaw) ? Math.trunc(rateBpsRaw) : NaN

  const tier = classifyRuleScope({ dealerProfileId, productTypeCode })

  const { data, isLoading } = useQuery<RulesResponse>({
    queryKey: ['commissions-admin-rules-overlap-check', dealerProfileId, productTypeCode],
    queryFn: () => fetchCrudList<RuleLike>(RULES_API_PATH, {
      page: 1,
      pageSize: 50,
      ...(dealerProfileId ? { dealerProfileId } : {}),
      ...(productTypeCode ? { productTypeCode } : {}),
    }),
    // A platform-wide rule list call (no dealerProfileId) would return every
    // dealer's rules too — only worth checking once a concrete scope is chosen.
    enabled: dealerProfileId != null || productTypeCode != null,
  })

  const scopedRules = React.useMemo(() => {
    const items = data?.items ?? []
    return items.filter((r) => (r.dealerProfileId ?? null) === dealerProfileId && (r.productTypeCode ?? null) === productTypeCode)
  }, [data, dealerProfileId, productTypeCode])
  const existingEffectiveRule = pickEffectiveRule(scopedRules)

  const inBpsRange = Number.isInteger(rateBps) && rateBps >= MIN_RATE_BPS && rateBps <= MAX_RATE_BPS
  const previewAmount = inBpsRange ? previewCommissionAmount(rateBps) : null

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-medium text-foreground">{t('commissions.admin.rules.form.preview.rateTitle', 'Rate preview')}</p>
        {inBpsRange && previewAmount != null ? (
          <p className="text-muted-foreground">
            {t(
              'commissions.admin.rules.form.preview.rateBody',
              `${formatBps(rateBps)} — on an example ₹${(EXAMPLE_SUBTOTAL_PAISE / 100).toLocaleString('en-IN')} order subtotal, that is a ${formatPaise(previewAmount)} commission.`,
              { bps: formatBps(rateBps), example: formatPaise(previewAmount) },
            )}
          </p>
        ) : (
          <p className="text-muted-foreground">
            {t('commissions.admin.rules.form.preview.rateEmpty', `Enter a rate between ${MIN_RATE_BPS} and ${MAX_RATE_BPS} bps to see the equivalent percentage and an example commission amount.`)}
          </p>
        )}
      </div>

      {tier === 'unreachable_platform_product_type' ? (
        <div className="rounded-md border border-status-warning-border bg-status-warning-bg p-2 text-status-warning-icon">
          {t(
            'commissions.admin.rules.form.preview.unreachableWarning',
            'A product-type rule with no dealer selected can never win: the commission engine only checks product-type rules for a specific dealer, never for "all dealers". Either pick a dealer, or clear the product type to create a platform-wide default.',
          )}
        </div>
      ) : null}

      {(dealerProfileId != null || productTypeCode != null) ? (
        <div>
          <p className="font-medium text-foreground">{t('commissions.admin.rules.form.preview.overlapTitle', 'Existing rules for this exact scope')}</p>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Spinner size="sm" /> {t('commissions.admin.rules.form.preview.overlapLoading', 'Checking for existing rules…')}</div>
          ) : scopedRules.length === 0 ? (
            <p className="text-muted-foreground">{t('commissions.admin.rules.form.preview.overlapNone', 'No existing rule matches this exact dealer + product-type combination yet.')}</p>
          ) : (
            <>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {scopedRules.map((r) => (
                  <li key={r.id} className="tabular-nums">
                    {formatBps(r.rateBps)} · {r.effectiveFrom} – {r.effectiveTo ?? t('commissions.admin.rules.form.preview.ongoing', 'ongoing')}
                    {existingEffectiveRule?.id === r.id ? ` (${t('commissions.admin.rules.form.preview.currentlyWins', 'currently wins')})` : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  'commissions.admin.rules.form.preview.overlapHint',
                  'There is no server-side overlap guard. The new rule you are creating will win over these only once its effective-from date is the latest among matching rules as of a given order’s assignment date.',
                )}
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
