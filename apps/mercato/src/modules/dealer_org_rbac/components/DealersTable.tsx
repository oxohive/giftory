"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { fetchCrudList, type ListResponse } from '@open-mercato/ui/backend/utils/crud'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import type { FilterValues } from '@open-mercato/ui/backend/FilterBar'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { summarizeCapabilities } from './capabilitiesPayload'
import { buildDealerDirectoryListParams } from './dealerDirectoryQuery'

const PAGE_SIZE = 25
const DEALERS_API_PATH = 'dealer_org_rbac/admin/dealers'

export type DealerDirectoryCapabilities = {
  productTypeCodes: string[]
  printingMethods: string[]
  maxDailyCapacity: number
  serviceableStates: string[]
  minOrderQty: number
  updatedAt: string | null
}

export type DealerDirectoryRow = {
  id: string
  businessName: string
  contactEmail: string
  phone: string
  businessType: string
  city: string
  state: string
  pincode: string
  kycStatus: string
  approvedAt: string | null
  updatedAt: string
  capabilities?: DealerDirectoryCapabilities | null
}

function useDealerDirectoryList(params: { page: number; pageSize: number; search?: string; state?: string }) {
  const query = React.useMemo(() => buildDealerDirectoryListParams(params), [params])
  return useQuery<ListResponse<DealerDirectoryRow>>({
    queryKey: ['dealer_org_rbac-admin-dealers-list', query],
    queryFn: () => fetchCrudList<DealerDirectoryRow>(DEALERS_API_PATH, query),
  })
}

/**
 * Admin dealer directory list (`GET /api/dealer_org_rbac/admin/dealers`,
 * CONTRACT-HANDOFF.md: `/backend/dealers`, "Verified working"). The route
 * already returns approved dealers only — there is no `kycStatus` query
 * param to filter on and no reason to show a status filter here (every
 * row is `approved`); the KYC status column still renders it explicitly
 * per Work item 1, so the admin sees it without having to infer it.
 *
 * Deliberately offers only `search` (business name/email) and a plain-text
 * `state` filter — see `dealerDirectoryQuery.ts` for why `state` is text,
 * not a dropdown, and why there is no product-type filter at all.
 */
export default function DealersTable() {
  const t = useT()
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [filters, setFilters] = React.useState<FilterValues>({})

  const state = typeof filters.state === 'string' ? filters.state : ''
  const params = React.useMemo(
    () => ({ page, pageSize: PAGE_SIZE, search: search || undefined, state: state || undefined }),
    [page, search, state],
  )
  const query = useDealerDirectoryList(params)

  const columns = React.useMemo<ColumnDef<DealerDirectoryRow>[]>(() => [
    { accessorKey: 'businessName', header: t('dealer_org_rbac.admin.directory.column.businessName', 'Business name'), meta: { priority: 1 } },
    { accessorKey: 'contactEmail', header: t('dealer_org_rbac.admin.directory.column.contactEmail', 'Contact email'), meta: { priority: 2 } },
    {
      accessorKey: 'state',
      header: t('dealer_org_rbac.admin.directory.column.location', 'Location'),
      cell: ({ row }) => {
        const parts = [row.original.city, row.original.state].filter(Boolean)
        return <span>{parts.length ? parts.join(', ') : '—'}</span>
      },
      meta: { priority: 3 },
    },
    {
      accessorKey: 'kycStatus',
      header: t('dealer_org_rbac.admin.directory.column.kycStatus', 'KYC status'),
      cell: ({ row }) => (
        <StatusBadge variant="success" dot>
          {t(`dealer_org_rbac.admin.kycStatus.${row.original.kycStatus}`, row.original.kycStatus)}
        </StatusBadge>
      ),
      meta: { priority: 4 },
    },
    {
      id: 'capabilitiesSummary',
      header: t('dealer_org_rbac.admin.directory.column.capabilities', 'Capabilities'),
      cell: ({ row }) => {
        const summary = summarizeCapabilities(row.original.capabilities)
        if (!summary) {
          return <span className="text-muted-foreground">{t('dealer_org_rbac.admin.capabilities.notConfigured', 'Not configured')}</span>
        }
        return (
          <span className="text-sm text-muted-foreground">
            {t('dealer_org_rbac.admin.directory.capabilitiesSummary', '{productTypes} product types · {printingMethods} printing methods · {capacity}/day capacity', {
              productTypes: summary.productTypeCount,
              printingMethods: summary.printingMethodCount,
              capacity: summary.maxDailyCapacity,
            })}
          </span>
        )
      },
      meta: { priority: 5 },
    },
  ], [t])

  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <DataTable<DealerDirectoryRow>
      title={t('dealer_org_rbac.admin.directory.title', 'Dealers')}
      titleHeadingLevel={1}
      entityId="dealer_org_rbac:dealer_profile"
      extensionTableId="dealer_org_rbac.admin.dealers"
      columns={columns}
      data={query.data?.items ?? []}
      isLoading={query.isLoading}
      error={query.error instanceof Error ? query.error.message : null}
      refreshButton={{ onRefresh: () => void query.refetch(), isRefreshing: query.isFetching, label: t('dealer_org_rbac.admin.directory.actions.refresh', 'Refresh') }}
      searchValue={search}
      searchPlaceholder={t('dealer_org_rbac.admin.directory.searchPlaceholder', 'Search by business name or email')}
      onSearchChange={(value) => { setSearch(value); setPage(1) }}
      filters={[{
        id: 'state',
        label: t('dealer_org_rbac.admin.directory.column.state', 'State'),
        type: 'text',
      }]}
      filterValues={filters}
      onFiltersApply={(value) => { setFilters(value); setPage(1) }}
      onFiltersClear={() => { setFilters({}); setPage(1) }}
      emptyState={t('dealer_org_rbac.admin.directory.empty', 'No approved dealers match these filters.')}
      onRowClick={(row) => router.push(`/backend/dealers/${row.id}`)}
      pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
    />
  )
}
