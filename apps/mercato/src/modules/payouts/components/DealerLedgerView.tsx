"use client"

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Banknote, Scale, Wallet } from 'lucide-react'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterBar'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusMap } from '@open-mercato/ui/primitives/status-badge'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { formatDisplayDateTime } from '@open-mercato/ui/primitives/date-format'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useLedgerAccess } from './useLedgerAccess'
import { formatPaise } from './money'
import { RecordPayoutDialog } from './RecordPayoutDialog'
import { CreateAdjustmentDialog } from './CreateAdjustmentDialog'
import type { EntryType, Direction } from '../lib/constants'

type LedgerEntryRow = {
  id: string
  dealerProfileId: string
  entryType: EntryType
  amount: number
  currencyCode: string
  direction: Direction
  note: string | null
  createdAt: string
}

type LedgerListResponse = {
  items: LedgerEntryRow[]
  total: number
  page: number
  pageSize: number
}

type BalanceResponse = {
  dealerProfileId: string
  pendingAmount: number
  totalEarned: number
  currencyCode: string
}

const PAGE_SIZE = 25

const ENTRY_TYPE_VARIANT: StatusMap<EntryType> = {
  commission_earned: 'success',
  payout_disbursed: 'info',
  adjustment_credit: 'success',
  adjustment_debit: 'warning',
}

function isDateInRange(iso: string, range: { from?: string; to?: string } | undefined): boolean {
  if (!range) return true
  const timestamp = new Date(iso).getTime()
  if (Number.isNaN(timestamp)) return true
  if (range.from) {
    const from = new Date(range.from).getTime()
    if (!Number.isNaN(from) && timestamp < from) return false
  }
  if (range.to) {
    // Inclusive end-of-day so a single-day range still matches entries created later that same day.
    const to = new Date(range.to).getTime() + (24 * 60 * 60 * 1000 - 1)
    if (!Number.isNaN(to) && timestamp > to) return false
  }
  return true
}

export function DealerLedgerView({ dealerProfileId, dealerLabel }: { dealerProfileId: string; dealerLabel?: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { canManage } = useLedgerAccess()
  const [page, setPage] = React.useState(1)
  const [filterValues, setFilterValues] = React.useState<FilterValues>({})
  const [payoutDialogOpen, setPayoutDialogOpen] = React.useState(false)
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = React.useState(false)

  const entryType = typeof filterValues.entryType === 'string' ? filterValues.entryType : undefined
  const direction = typeof filterValues.direction === 'string' ? filterValues.direction : undefined
  const dateRange = filterValues.createdAt as { from?: string; to?: string } | undefined

  const ledgerQueryKey = ['payouts-admin-ledger', dealerProfileId, page, entryType, direction]
  const balanceQueryKey = ['payouts-admin-ledger-balance', dealerProfileId]

  const { data: ledgerData, isLoading: isLedgerLoading, error: ledgerError } = useQuery<LedgerListResponse>({
    queryKey: ledgerQueryKey,
    queryFn: () => fetchCrudList<LedgerEntryRow>(`payouts/admin/dealers/${encodeURIComponent(dealerProfileId)}/ledger`, {
      page,
      pageSize: PAGE_SIZE,
      ...(entryType ? { entryType } : {}),
      ...(direction ? { direction } : {}),
    }),
  })

  const { data: balanceData, isLoading: isBalanceLoading, error: balanceError } = useQuery<BalanceResponse>({
    queryKey: balanceQueryKey,
    queryFn: () => readApiResultOrThrow<BalanceResponse>(
      `/api/payouts/admin/dealers/${encodeURIComponent(dealerProfileId)}/ledger/balance`,
      undefined,
      { errorMessage: t('payouts.admin.ledger.error.balance', 'Failed to load balance') },
    ),
  })

  const refreshAll = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['payouts-admin-ledger', dealerProfileId] })
    void queryClient.invalidateQueries({ queryKey: ['payouts-admin-ledger-balance', dealerProfileId] })
  }, [queryClient, dealerProfileId])

  const visibleRows = React.useMemo(() => {
    const items = ledgerData?.items ?? []
    if (!dateRange || (!dateRange.from && !dateRange.to)) return items
    return items.filter((row) => isDateInRange(row.createdAt, dateRange))
  }, [ledgerData?.items, dateRange])

  const entryTypeLabel = React.useCallback((value: EntryType) => t(`payouts.admin.entryType.${value}`, value), [t])

  const columns = React.useMemo<ColumnDef<LedgerEntryRow>[]>(() => [
    {
      accessorKey: 'createdAt',
      header: t('payouts.admin.ledger.table.column.date', 'Date'),
      cell: ({ getValue }) => <span className="tabular-nums">{formatDisplayDateTime(String(getValue())) ?? String(getValue())}</span>,
      meta: { priority: 1 },
    },
    {
      accessorKey: 'entryType',
      header: t('payouts.admin.ledger.table.column.type', 'Type'),
      cell: ({ getValue }) => {
        const value = getValue() as EntryType
        return <StatusBadge variant={ENTRY_TYPE_VARIANT[value] ?? 'neutral'} dot>{entryTypeLabel(value)}</StatusBadge>
      },
      meta: { priority: 1 },
    },
    {
      accessorKey: 'amount',
      header: t('payouts.admin.ledger.table.column.amount', 'Amount'),
      cell: ({ row }) => {
        const isCredit = row.original.direction === 'credit'
        return (
          <span className={isCredit ? 'tabular-nums text-status-success-icon' : 'tabular-nums text-status-error-icon'}>
            {isCredit ? '+ ' : '− '}{formatPaise(row.original.amount, row.original.currencyCode)}
          </span>
        )
      },
      meta: { priority: 1 },
    },
    {
      accessorKey: 'note',
      header: t('payouts.admin.ledger.table.column.note', 'Note / reference'),
      cell: ({ getValue }) => {
        const value = getValue() as string | null
        return value ? <span>{value}</span> : <span className="text-muted-foreground">—</span>
      },
      meta: { priority: 2 },
    },
  ], [t, entryTypeLabel])

  const filters = React.useMemo<FilterDef[]>(() => [
    {
      id: 'entryType',
      label: t('payouts.admin.ledger.filters.entryType', 'Entry type'),
      type: 'select',
      options: [
        { value: 'commission_earned', label: entryTypeLabel('commission_earned') },
        { value: 'payout_disbursed', label: entryTypeLabel('payout_disbursed') },
        { value: 'adjustment_credit', label: entryTypeLabel('adjustment_credit') },
        { value: 'adjustment_debit', label: entryTypeLabel('adjustment_debit') },
      ],
    },
    {
      id: 'direction',
      label: t('payouts.admin.ledger.filters.direction', 'Direction'),
      type: 'select',
      options: [
        { value: 'credit', label: t('payouts.admin.ledger.direction.credit', 'Credit') },
        { value: 'debit', label: t('payouts.admin.ledger.direction.debit', 'Debit') },
      ],
    },
    {
      id: 'createdAt',
      label: t('payouts.admin.ledger.filters.dateRange', 'Date range'),
      type: 'dateRange',
      tooltip: t('payouts.admin.ledger.filters.dateRangeTooltip', 'Filters only the entries currently loaded on this page, not the full history'),
    },
  ], [t, entryTypeLabel])

  const total = ledgerData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader
        title={dealerLabel ? t('payouts.admin.ledger.titleWithDealer', `Payout ledger — ${dealerLabel}`) : t('payouts.admin.ledger.title', 'Payout ledger')}
        description={t('payouts.admin.ledger.description', 'Append-only record of commissions earned, payouts recorded, and manual adjustments for this dealer.')}
        actions={canManage ? (
          <>
            <Button type="button" variant="outline" onClick={() => setAdjustmentDialogOpen(true)}>
              <Scale /> {t('payouts.admin.ledger.actions.addAdjustment', 'Add adjustment')}
            </Button>
            <Button type="button" onClick={() => setPayoutDialogOpen(true)}>
              <Banknote /> {t('payouts.admin.ledger.actions.recordPayout', 'Record payout')}
            </Button>
          </>
        ) : null}
      />
      <PageBody>
        <Alert status="information" style="lighter" icon={<Wallet className="size-4" />}>
          {t(
            'payouts.admin.ledger.moneyDisclaimer',
            'Recording a payout here documents a payment that was already completed outside Giftory (e.g. a bank transfer). It does not send any money — Giftory has no disbursement integration yet.',
          )}
        </Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">{t('payouts.admin.ledger.balance.pending', 'Pending balance')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {isBalanceLoading ? '—' : formatPaise(balanceData?.pendingAmount ?? 0, balanceData?.currencyCode ?? 'INR')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('payouts.admin.ledger.balance.pendingHint', 'Earned but not yet paid out, net of recorded payouts and debit adjustments')}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">{t('payouts.admin.ledger.balance.earned', 'Total earned (lifetime)')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {isBalanceLoading ? '—' : formatPaise(balanceData?.totalEarned ?? 0, balanceData?.currencyCode ?? 'INR')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('payouts.admin.ledger.balance.earnedHint', 'Commissions only — unaffected by payouts or adjustments')}
            </p>
          </div>
        </div>
        {balanceError ? (
          <Alert status="error" style="lighter">
            {balanceError instanceof Error ? balanceError.message : t('payouts.admin.ledger.error.balance', 'Failed to load balance')}
          </Alert>
        ) : null}
        <DataTable<LedgerEntryRow>
          title={t('payouts.admin.ledger.table.title', 'Ledger entries')}
          extensionTableId="payouts-dealer-ledger"
          columns={columns}
          data={visibleRows}
          isLoading={isLedgerLoading}
          error={ledgerError instanceof Error ? ledgerError.message : null}
          filters={filters}
          filterValues={filterValues}
          onFiltersApply={(values) => { setFilterValues(values); setPage(1) }}
          onFiltersClear={() => { setFilterValues({}); setPage(1) }}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            totalPages,
            onPageChange: setPage,
          }}
          emptyState={t('payouts.admin.ledger.table.empty', 'No ledger entries yet for this dealer.')}
        />
      </PageBody>
      <RecordPayoutDialog
        open={payoutDialogOpen}
        onOpenChange={setPayoutDialogOpen}
        dealerProfileId={dealerProfileId}
        onRecorded={refreshAll}
      />
      <CreateAdjustmentDialog
        open={adjustmentDialogOpen}
        onOpenChange={setAdjustmentDialogOpen}
        dealerProfileId={dealerProfileId}
        onRecorded={refreshAll}
      />
    </>
  )
}
