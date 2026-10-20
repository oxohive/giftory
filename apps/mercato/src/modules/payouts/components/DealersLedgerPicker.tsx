"use client"

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useRouter } from 'next/navigation'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { useT } from '@open-mercato/shared/lib/i18n/context'

/**
 * Only the fields this picker renders — the real admin-dealers response
 * (`GET /api/dealer_org_rbac/admin/dealers`, verified working per
 * CONTRACT-HANDOFF.md) carries more (gstin/pan/capabilities/etc).
 */
type DealerListItem = {
  id: string
  businessName: string
  contactEmail: string
  city: string | null
  state: string | null
}

type DealerListResponse = {
  items: DealerListItem[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 25

/**
 * Admin entry point for the payouts ledger. `payouts` admin routes are all
 * scoped to one dealer (`/admin/dealers/{id}/ledger...`) — there is no
 * cross-dealer ledger listing endpoint — so an admin needs to pick a dealer
 * first. This consumes `dealer_org_rbac`'s already-shipped admin dealers
 * list (read-only HTTP call to a documented contract; no cross-module
 * import) rather than duplicating dealer directory UI. See this task's
 * handoff for the nav-placement rationale.
 */
export function DealersLedgerPicker() {
  const t = useT()
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery<DealerListResponse>({
    queryKey: ['payouts-admin-dealers-picker', search, page],
    queryFn: () => fetchCrudList<DealerListItem>('dealer_org_rbac/admin/dealers', {
      page,
      pageSize: PAGE_SIZE,
      ...(search ? { search } : {}),
    }),
  })

  const columns = React.useMemo<ColumnDef<DealerListItem>[]>(() => [
    { accessorKey: 'businessName', header: t('payouts.admin.dealerPicker.table.column.name', 'Dealer'), meta: { priority: 1 } },
    { accessorKey: 'contactEmail', header: t('payouts.admin.dealerPicker.table.column.email', 'Contact email'), meta: { priority: 2 } },
    {
      accessorKey: 'city',
      header: t('payouts.admin.dealerPicker.table.column.location', 'Location'),
      cell: ({ row }) => {
        const parts = [row.original.city, row.original.state].filter(Boolean)
        return <span>{parts.length ? parts.join(', ') : '—'}</span>
      },
      meta: { priority: 3 },
    },
  ], [t])

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader
        title={t('payouts.admin.dealerPicker.title', 'Payouts')}
        description={t('payouts.admin.dealerPicker.description', 'Pick a dealer to view their ledger, record a payout, or add an adjustment.')}
      />
      <PageBody>
        <Alert status="information" style="lighter">
          {t(
            'payouts.admin.dealerPicker.notice',
            'Payouts are always viewed per dealer. Only approved dealers appear here.',
          )}
        </Alert>
        <DataTable<DealerListItem>
          title={t('payouts.admin.dealerPicker.table.title', 'Approved dealers')}
          extensionTableId="payouts-dealer-picker"
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error instanceof Error ? error.message : null}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          searchPlaceholder={t('payouts.admin.dealerPicker.searchPlaceholder', 'Search by business name or email')}
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
          onRowClick={(row) => router.push(`/backend/dealers/${row.id}/ledger`)}
          emptyState={t('payouts.admin.dealerPicker.table.empty', 'No approved dealers yet.')}
        />
      </PageBody>
    </>
  )
}
