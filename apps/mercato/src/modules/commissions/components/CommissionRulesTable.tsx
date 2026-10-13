"use client"

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterBar'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tag, type TagMap } from '@open-mercato/ui/primitives/tag'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { AccessDeniedMessage } from '@open-mercato/ui/backend/detail'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatBps } from './money'
import { classifyRuleScope, type RuleScopeTier } from './ruleScope'
import { buildRulesListParams } from './rulesQuery'
import { useDealerNameMap, loadDealerOptions } from './dealerLookup'
import { useCommissionAccess } from './useCommissionAccess'

const API_PATH = 'commissions/admin/commission/rules'
const PAGE_SIZE = 25

type RuleRow = {
  id: string
  dealerProfileId: string | null
  productTypeCode: string | null
  rateBps: number
  effectiveFrom: string
  effectiveTo: string | null
  createdAt: string
}

type RulesResponse = {
  items: RuleRow[]
  total: number
  page: number
  pageSize: number
}

type Translate = ReturnType<typeof useT>

const TIER_VARIANT: TagMap<RuleScopeTier> = {
  dealer_product_type: 'brand',
  dealer_default: 'info',
  platform: 'neutral',
  unreachable_platform_product_type: 'error',
}

function tierLabel(t: Translate, tier: RuleScopeTier): string {
  switch (tier) {
    case 'dealer_product_type': return t('commissions.admin.rules.tier.dealerProductType', 'Dealer + product type')
    case 'dealer_default': return t('commissions.admin.rules.tier.dealerDefault', 'Dealer default')
    case 'platform': return t('commissions.admin.rules.tier.platform', 'Platform default')
    case 'unreachable_platform_product_type': return t('commissions.admin.rules.tier.unreachable', 'Unreachable (no dealer set)')
  }
}

function formatEffectiveWindow(t: Translate, from: string, to: string | null): string {
  return to
    ? t('commissions.admin.rules.table.window.range', `${from} – ${to}`, { from, to })
    : t('commissions.admin.rules.table.window.ongoing', `${from} – ongoing`, { from })
}

export default function CommissionRulesTable() {
  const t = useT()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const { canManage, isLoading: isAccessLoading } = useCommissionAccess()
  const { runMutation } = useGuardedMutation<{ ruleId: string }>({ contextId: 'commissions-rules-deactivate' })

  const [filterValues, setFilterValues] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)

  const dealerProfileId = typeof filterValues.dealerProfileId === 'string' ? filterValues.dealerProfileId : undefined
  const productTypeCode = typeof filterValues.productTypeCode === 'string' ? filterValues.productTypeCode.trim() || undefined : undefined
  const includeDeactivated = filterValues.includeDeactivated === true

  const params = React.useMemo(
    () => buildRulesListParams({ page, pageSize: PAGE_SIZE, dealerProfileId, productTypeCode, includeDeactivated }),
    [page, dealerProfileId, productTypeCode, includeDeactivated],
  )

  const { data, isLoading, error, refetch, isFetching } = useQuery<RulesResponse>({
    queryKey: ['commissions-admin-rules', params, scopeVersion],
    queryFn: () => fetchCrudList<RuleRow>(API_PATH, params),
  })

  const items = React.useMemo(() => data?.items ?? [], [data])
  const dealerIds = React.useMemo(() => items.map((r) => r.dealerProfileId).filter((id): id is string => Boolean(id)), [items])
  const { names: dealerNames } = useDealerNameMap(dealerIds)

  const handleDeactivate = React.useCallback(async (row: RuleRow) => {
    const confirmed = await confirm({
      title: t('commissions.admin.rules.confirmDeactivate.title', 'Deactivate commission rule'),
      text: t(
        'commissions.admin.rules.confirmDeactivate.text',
        'This stops the rule from applying to any order assigned from today onward. It never changes the frozen rate on orders already assigned — commission snapshots are immutable.',
      ),
      variant: 'destructive',
    })
    if (!confirmed) return

    const result = await runMutation({
      operation: () => apiCall<{ ok: boolean }>(`/api/${API_PATH}/${encodeURIComponent(row.id)}`, { method: 'DELETE' }),
      context: { ruleId: row.id },
    })
    if (result?.ok && result.result?.ok) {
      flash(t('commissions.admin.rules.flash.deactivated', 'Commission rule deactivated'), 'success')
      void queryClient.invalidateQueries({ queryKey: ['commissions-admin-rules'] })
    } else {
      flash(t('commissions.admin.rules.errors.deactivate', 'Failed to deactivate rule'), 'error')
    }
  }, [confirm, queryClient, runMutation, t])

  const columns = React.useMemo<ColumnDef<RuleRow>[]>(() => [
    {
      id: 'scope',
      header: t('commissions.admin.rules.table.column.scope', 'Scope'),
      meta: { priority: 1 },
      cell: ({ row }) => {
        const r = row.original
        const tier = classifyRuleScope(r)
        const dealerLabel = r.dealerProfileId
          ? (dealerNames.get(r.dealerProfileId) ?? r.dealerProfileId)
          : t('commissions.admin.rules.scope.platformWide', 'Platform-wide (all dealers)')
        return (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{dealerLabel}</span>
            <div className="flex items-center gap-2">
              <Tag variant={TIER_VARIANT[tier]} dot>{tierLabel(t, tier)}</Tag>
              {r.productTypeCode ? (
                <code className="text-xs text-muted-foreground">{r.productTypeCode}</code>
              ) : null}
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'rateBps',
      header: t('commissions.admin.rules.table.column.rate', 'Rate'),
      meta: { priority: 1 },
      cell: ({ getValue }) => <span className="tabular-nums">{formatBps(Number(getValue()))}</span>,
    },
    {
      id: 'effective',
      header: t('commissions.admin.rules.table.column.effective', 'Effective'),
      meta: { priority: 2 },
      cell: ({ row }) => (
        <span className="tabular-nums text-sm">{formatEffectiveWindow(t, row.original.effectiveFrom, row.original.effectiveTo)}</span>
      ),
    },
    {
      id: 'status',
      header: t('commissions.admin.rules.table.column.status', 'Status'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => {
        const active = row.original.effectiveTo == null
        return (
          <StatusBadge variant={active ? 'success' : 'neutral'} dot>
            {active
              ? t('commissions.admin.rules.status.active', 'Active')
              : t('commissions.admin.rules.status.inactive', 'Deactivated')}
          </StatusBadge>
        )
      },
    },
    {
      accessorKey: 'createdAt',
      header: t('commissions.admin.rules.table.column.createdAt', 'Created'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{String(getValue()).slice(0, 10)}</span>,
    },
  ], [dealerNames, t])

  const filters = React.useMemo<FilterDef[]>(() => [
    {
      id: 'dealerProfileId',
      label: t('commissions.admin.rules.table.filters.dealer', 'Dealer'),
      type: 'combobox',
      loadOptions: loadDealerOptions,
    },
    {
      id: 'productTypeCode',
      label: t('commissions.admin.rules.table.filters.productType', 'Product type code'),
      type: 'text',
    },
    {
      id: 'includeDeactivated',
      label: t('commissions.admin.rules.table.filters.includeDeactivated', 'Show deactivated rules too'),
      type: 'checkbox',
    },
  ], [t])

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (!isAccessLoading && !canManage && items.length === 0 && error) {
    // Only ever reached if the underlying list call itself 403s (e.g. a
    // stale session losing `commissions.view` mid-visit) — the page itself
    // is already gated server-side via page.meta.ts `requireFeatures`.
    const status = (error as { status?: number } | undefined)?.status
    if (status === 403) {
      return (
        <AccessDeniedMessage
          label={t('commissions.admin.rules.errors.forbidden', "You don't have permission to view commission rules.")}
        />
      )
    }
  }

  return (
    <>
      <PageHeader
        title={t('commissions.admin.rules.page.title', 'Commission rules')}
        description={t(
          'commissions.admin.rules.page.description',
          'Platform, dealer, and product-type commission rates. When more than one rule could apply to an order, the most specific scope wins (dealer + product type, then dealer default, then platform default); within the same scope the rule with the latest effective-from date wins. Deactivating a rule only affects orders assigned from today onward — it never changes the commission already frozen on an existing order.',
        )}
        actions={canManage ? (
          <>
            <Button asChild variant="outline">
              <Link href="/backend/commission-rules/dealers">
                {t('commissions.admin.rules.actions.viewDealerHistory', 'Dealer commission history')}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/backend/commission-rules/create">
                {t('commissions.admin.rules.actions.create', 'Create rule')}
              </Link>
            </Button>
          </>
        ) : (
          <Button asChild variant="outline">
            <Link href="/backend/commission-rules/dealers">
              {t('commissions.admin.rules.actions.viewDealerHistory', 'Dealer commission history')}
            </Link>
          </Button>
        )}
      />
      <PageBody>
        <Alert status="information" style="lighter">
          <AlertDescription>
            {t(
              'commissions.admin.rules.bpsHelp',
              'Rates are entered in basis points (bps): 100 bps = 1%, and the maximum is 10,000 bps (100%). A commission amount is always rounded to the nearest paise: amount = round(order subtotal in paise × rate bps ÷ 10,000).',
            )}
          </AlertDescription>
        </Alert>
        <DataTable<RuleRow>
          title={t('commissions.admin.rules.table.title', 'Rules')}
          extensionTableId="commissions-admin-rules"
          columns={columns}
          data={items}
          isLoading={isLoading}
          error={error ? (error instanceof Error ? error.message : t('commissions.admin.rules.errors.load', 'Failed to load commission rules')) : null}
          refreshButton={{
            onRefresh: () => void refetch(),
            isRefreshing: isFetching,
            label: t('commissions.admin.rules.actions.refresh', 'Refresh'),
          }}
          filters={filters}
          filterValues={filterValues}
          onFiltersApply={(values) => { setFilterValues(values); setPage(1) }}
          onFiltersClear={() => { setFilterValues({}); setPage(1) }}
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
          emptyState={t('commissions.admin.rules.table.empty', 'No commission rules yet. Create one to set a platform, dealer, or product-type rate.')}
          rowActions={canManage ? (row) => (
            <RowActions
              items={[
                ...(row.dealerProfileId ? [{
                  id: 'history',
                  label: t('commissions.admin.rules.actions.viewHistoryForDealer', 'View this dealer’s commission history'),
                  href: `/backend/dealers/${row.dealerProfileId}/commission`,
                }] : []),
                ...(row.effectiveTo == null ? [{
                  id: 'deactivate',
                  label: t('commissions.admin.rules.actions.deactivate', 'Deactivate'),
                  destructive: true,
                  onSelect: () => void handleDeactivate(row),
                }] : []),
              ]}
            />
          ) : (row) => (row.dealerProfileId ? (
            <RowActions
              items={[{
                id: 'history',
                label: t('commissions.admin.rules.actions.viewHistoryForDealer', 'View this dealer’s commission history'),
                href: `/backend/dealers/${row.dealerProfileId}/commission`,
              }]}
            />
          ) : null)}
        />
      </PageBody>
      {ConfirmDialogElement}
    </>
  )
}
