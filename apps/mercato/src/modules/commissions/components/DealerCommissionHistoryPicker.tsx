"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useDealerList, type DealerOption } from './dealerLookup'

const PAGE_SIZE = 25

/**
 * Admin entry point for a dealer's commission history. Commission
 * snapshots are queried per dealer
 * (`GET /api/commissions/admin/dealers/{dealerId}/commission`) — there is
 * no cross-dealer snapshot listing endpoint — so, mirroring
 * `payouts/components/DealersLedgerPicker.tsx`'s identical need, an admin
 * picks a dealer first. This consumes `dealer_org_rbac`'s already-shipped
 * admin dealers list (read-only HTTP call to a documented contract; no
 * cross-module import), the same pattern that picker uses.
 */
export function DealerCommissionHistoryPicker() {
  const t = useT()
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error, refetch, isFetching } = useDealerList({ page, pageSize: PAGE_SIZE, search: search || undefined })

  const columns = React.useMemo<ColumnDef<DealerOption>[]>(() => [
    { accessorKey: 'businessName', header: t('commissions.admin.dealerHistory.picker.table.column.name', 'Dealer'), meta: { priority: 1 } },
    { accessorKey: 'contactEmail', header: t('commissions.admin.dealerHistory.picker.table.column.email', 'Contact email'), meta: { priority: 2 } },
    {
      accessorKey: 'city',
      header: t('commissions.admin.dealerHistory.picker.table.column.location', 'Location'),
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
        title={t('commissions.admin.dealerHistory.picker.title', 'Dealer commission history')}
        description={t('commissions.admin.dealerHistory.picker.description', 'Pick a dealer to see every commission snapshot ever frozen for their orders — the recorded rate and amount never changes once an order is assigned, even if the rule is later edited or deactivated.')}
      />
      <PageBody>
        <Alert status="information" style="lighter">
          {t('commissions.admin.dealerHistory.picker.notice', 'Only approved dealers appear here.')}
        </Alert>
        <DataTable<DealerOption>
          title={t('commissions.admin.dealerHistory.picker.table.title', 'Approved dealers')}
          extensionTableId="commissions-dealer-history-picker"
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error instanceof Error ? error.message : null}
          refreshButton={{ onRefresh: () => void refetch(), isRefreshing: isFetching, label: t('commissions.admin.dealerHistory.picker.actions.refresh', 'Refresh') }}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          searchPlaceholder={t('commissions.admin.dealerHistory.picker.searchPlaceholder', 'Search by business name or email')}
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
          onRowClick={(row) => router.push(`/backend/dealers/${row.id}/commission`)}
          emptyState={t('commissions.admin.dealerHistory.picker.table.empty', 'No approved dealers yet.')}
        />
      </PageBody>
    </>
  )
}
