"use client"

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatBps, formatPaise } from './money'

const PAGE_SIZE = 25

type SnapshotRow = {
  id: string
  assignmentId: string
  orderId: string
  dealerProfileId: string
  subtotalAmount: number
  currencyCode: string
  commissionRateBps: number
  commissionAmount: number
  ruleId: string | null
  snapshottedAt: string
}

type SnapshotsResponse = {
  items: SnapshotRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * Read-only commission snapshot history for one dealer
 * (`GET /api/commissions/admin/dealers/{dealerId}/commission`, "Verified
 * working" per CONTRACT-HANDOFF.md). No write affordance exists here or
 * anywhere in this view by design — snapshots are immutable (frozen at
 * assignment time; see `data/entities.ts`'s `OrderCommissionSnapshot` doc
 * comment and `docs/phase-2-status.md`'s "how the money flows" section). A
 * rule being created/deactivated afterward never changes a row shown here;
 * there is no per-entry running total — this module has no aggregate
 * endpoint (unlike `payouts`'s `/ledger/balance`), so the page sum below is
 * explicitly labelled as page-scoped, not a lifetime total.
 */
export function DealerCommissionHistoryView({ dealerProfileId, dealerLabel }: { dealerProfileId: string; dealerLabel?: string }) {
  const t = useT()
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error, refetch, isFetching } = useQuery<SnapshotsResponse>({
    queryKey: ['commissions-admin-dealer-history', dealerProfileId, page],
    queryFn: () => fetchCrudList<SnapshotRow>(`commissions/admin/dealers/${encodeURIComponent(dealerProfileId)}/commission`, {
      page,
      pageSize: PAGE_SIZE,
    }),
  })

  const items = React.useMemo(() => data?.items ?? [], [data])
  const pageTotalPaise = React.useMemo(() => items.reduce((sum, row) => sum + row.commissionAmount, 0), [items])

  const columns = React.useMemo<ColumnDef<SnapshotRow>[]>(() => [
    {
      accessorKey: 'snapshottedAt',
      header: t('commissions.admin.dealerHistory.table.column.date', 'Frozen at'),
      cell: ({ getValue }) => <span className="tabular-nums">{new Date(String(getValue())).toLocaleString()}</span>,
      meta: { priority: 1 },
    },
    {
      accessorKey: 'orderId',
      header: t('commissions.admin.dealerHistory.table.column.order', 'Order'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ getValue }) => {
        const orderId = String(getValue())
        return (
          <Link className="text-primary underline underline-offset-2" href={`/backend/sales/orders/${orderId}`}>
            {orderId.slice(0, 8)}…
          </Link>
        )
      },
    },
    {
      accessorKey: 'commissionRateBps',
      header: t('commissions.admin.dealerHistory.table.column.rate', 'Rate (frozen)'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ getValue }) => <span className="tabular-nums">{formatBps(Number(getValue()))}</span>,
    },
    {
      accessorKey: 'subtotalAmount',
      header: t('commissions.admin.dealerHistory.table.column.subtotal', 'Order subtotal'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => <span className="tabular-nums">{formatPaise(row.original.subtotalAmount, row.original.currencyCode)}</span>,
    },
    {
      accessorKey: 'commissionAmount',
      header: t('commissions.admin.dealerHistory.table.column.amount', 'Commission (frozen)'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="tabular-nums font-medium">{formatPaise(row.original.commissionAmount, row.original.currencyCode)}</span>,
    },
    {
      accessorKey: 'ruleId',
      header: t('commissions.admin.dealerHistory.table.column.rule', 'Rule applied'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ getValue }) => {
        const ruleId = getValue() as string | null
        return ruleId
          ? <code className="text-xs text-muted-foreground">{String(ruleId).slice(0, 8)}…</code>
          : <span className="text-xs text-muted-foreground">{t('commissions.admin.dealerHistory.table.noRule', 'No rule matched (₹0)')}</span>
      },
    },
  ], [t])

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader
        title={dealerLabel
          ? t('commissions.admin.dealerHistory.titleWithDealer', `Commission history — ${dealerLabel}`, { dealer: dealerLabel })
          : t('commissions.admin.dealerHistory.title', 'Commission history')}
        description={t(
          'commissions.admin.dealerHistory.description',
          'Every commission snapshot ever frozen for this dealer’s assigned orders, newest first. Each row is immutable: it shows exactly the rate and amount recorded at assignment time, even if the underlying rule has since been edited or deactivated.',
        )}
      />
      <PageBody>
        <Alert status="information" style="lighter">
          <AlertDescription>
            {t(
              'commissions.admin.dealerHistory.immutabilityNotice',
              'These rows never change after the fact. Deactivating or editing a commission rule only affects orders assigned from that point onward — it cannot rewrite a snapshot already recorded here.',
            )}
          </AlertDescription>
        </Alert>
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">
            {t('commissions.admin.dealerHistory.pageTotal.label', 'Commission total (this page only)')}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPaise(pageTotalPaise)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('commissions.admin.dealerHistory.pageTotal.hint', 'Sums only the rows currently shown — there is no lifetime-total endpoint for commissions.')}
          </p>
        </div>
        <DataTable<SnapshotRow>
          title={t('commissions.admin.dealerHistory.table.title', 'Commission snapshots')}
          extensionTableId="commissions-dealer-history"
          columns={columns}
          data={items}
          isLoading={isLoading}
          error={error instanceof Error ? error.message : null}
          refreshButton={{ onRefresh: () => void refetch(), isRefreshing: isFetching, label: t('commissions.admin.dealerHistory.actions.refresh', 'Refresh') }}
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
          emptyState={t('commissions.admin.dealerHistory.table.empty', 'No commission has been recorded for this dealer yet.')}
        />
      </PageBody>
    </>
  )
}
