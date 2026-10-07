"use client"
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import type { SortingState } from '@tanstack/react-table'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import type { FilterValues } from '@open-mercato/ui/backend/FilterBar'
import { BooleanIcon } from '@open-mercato/ui/backend/ValueIcons'
import { Button } from '@open-mercato/ui/primitives/button'
import { fetchCrudList, deleteCrud } from '@open-mercato/ui/backend/utils/crud'
import { withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { GiftOccasionListItem } from '../lib/profileRows'

const API_PATH = 'gift_catalog/occasions'
const LIST_HREF = '/backend/gift-occasions'
const PAGE_SIZE = 50

/** DataTable column id → list API `sortField` (validated server-side by the list schema). */
const SORT_FIELDS: Record<string, string> = {
  sortOrder: 'sort_order',
  label: 'label',
  code: 'code',
}

type OccasionsResponse = {
  items: GiftOccasionListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  totalIsCapped?: boolean
}

type Translate = ReturnType<typeof useT>

function buildColumns(t: Translate): ColumnDef<GiftOccasionListItem>[] {
  return [
    { accessorKey: 'label', header: t('gift_catalog.occasions.table.columns.label'), meta: { priority: 1 } },
    {
      accessorKey: 'code',
      header: t('gift_catalog.occasions.table.columns.code'),
      meta: { priority: 2 },
      cell: ({ getValue }) => <code className="text-xs">{String(getValue() ?? '')}</code>,
    },
    { accessorKey: 'sortOrder', header: t('gift_catalog.occasions.table.columns.sortOrder'), meta: { priority: 3 } },
    {
      accessorKey: 'isActive',
      header: t('gift_catalog.occasions.table.columns.isActive'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ getValue }) => <BooleanIcon value={Boolean(getValue())} />,
    },
    {
      accessorKey: 'description',
      header: t('gift_catalog.occasions.table.columns.description'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ getValue }) => {
        const value = getValue()
        return typeof value === 'string' && value.length > 0
          ? <span className="line-clamp-1 text-sm text-muted-foreground">{value}</span>
          : <span className="text-xs text-muted-foreground">—</span>
      },
    },
  ]
}

export default function OccasionsTable() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [search, setSearch] = React.useState('')
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'sortOrder', desc: false }])
  const [page, setPage] = React.useState(1)

  const columns = React.useMemo(() => buildColumns(t), [t])

  const params = React.useMemo(() => {
    const out: Record<string, string> = {
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sortField: SORT_FIELDS[sorting[0]?.id ?? ''] ?? 'sort_order',
      sortDir: sorting[0]?.desc ? 'desc' : 'asc',
    }
    if (search.trim()) out.search = search.trim()
    if (filters.isActive === true || filters.isActive === false) out.isActive = String(filters.isActive)
    return out
  }, [filters, page, search, sorting])

  const { data, isLoading, error } = useQuery<OccasionsResponse>({
    queryKey: ['gift_catalog', 'occasions', params, scopeVersion],
    queryFn: async () => fetchCrudList<GiftOccasionListItem>(API_PATH, params),
  })

  const handleDelete = React.useCallback(async (row: GiftOccasionListItem) => {
    const confirmed = await confirm({
      title: t('gift_catalog.occasions.confirmDelete.title'),
      text: t('gift_catalog.occasions.confirmDelete.text', { label: row.label }),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      // Row delete carries the row's own version, so a stale list fails with 409.
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () => deleteCrud(API_PATH, row.id))
      flash(t('gift_catalog.occasions.flash.deleted'), 'success')
    } catch (err) {
      if (!surfaceRecordConflict(err, t)) {
        const message = err instanceof Error && err.message ? err.message : t('gift_catalog.occasions.errors.delete')
        flash(message, 'error')
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['gift_catalog', 'occasions'] })
    }
  }, [confirm, queryClient, t])

  if (error) return <ErrorMessage label={t('gift_catalog.occasions.errors.load')} />

  return (
    <>
      <DataTable
        title={t('gift_catalog.occasions.page.title')}
        titleHeadingLevel={1}
        actions={(
          <Button asChild>
            <Link href={`${LIST_HREF}/create`}>{t('gift_catalog.occasions.actions.create')}</Link>
          </Button>
        )}
        columns={columns}
        data={data?.items ?? []}
        searchValue={search}
        searchPlaceholder={t('gift_catalog.occasions.table.searchPlaceholder')}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        searchAlign="right"
        filters={[{ id: 'isActive', label: t('gift_catalog.occasions.table.filters.isActive'), type: 'checkbox' }]}
        filterValues={filters}
        onFiltersApply={(values: FilterValues) => {
          setFilters(values)
          setPage(1)
        }}
        onFiltersClear={() => {
          setFilters({})
          setSearch('')
          setPage(1)
        }}
        entityId="gift_catalog:gift_occasion"
        sortable
        sorting={sorting}
        onSortingChange={(next: SortingState) => {
          setSorting(next)
          setPage(1)
        }}
        perspective={{ tableId: 'gift_catalog.occasions.list' }}
        emptyState={
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('gift_catalog.occasions.table.empty')}
          </div>
        }
        rowActions={(row) => (
          <RowActions
            items={[
              { label: t('gift_catalog.occasions.actions.edit'), href: `${LIST_HREF}/${row.id}/edit` },
              { label: t('gift_catalog.occasions.actions.delete'), destructive: true, onSelect: () => void handleDelete(row) },
            ]}
          />
        )}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          totalIsCapped: data?.totalIsCapped === true,
          onPageChange: setPage,
        }}
        isLoading={isLoading}
        onRowClick={(row) => router.push(`${LIST_HREF}/${row.id}/edit`)}
      />
      {ConfirmDialogElement}
    </>
  )
}
