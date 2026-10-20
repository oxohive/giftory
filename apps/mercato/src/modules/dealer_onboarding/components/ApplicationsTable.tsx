'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import type { FilterValues } from '@open-mercato/ui/backend/FilterBar'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DEALER_KYC_STATUSES, type DealerKycStatus } from '../lib/constants'
import { buildApplicationsListParams } from './applicationsQuery'
import { ResourceError, useAdminResource, type DealerRow, type ListResult } from './adminShared'

const PAGE_SIZE = 25

const KYC_STATUS_VARIANT: Record<DealerKycStatus, StatusBadgeVariant> = {
  pending_verification: 'warning',
  under_review: 'info',
  approved: 'success',
  rejected: 'error',
}

export default function ApplicationsTable() {
  const t = useT()
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [filters, setFilters] = React.useState<FilterValues>({})

  const kycStatus = typeof filters.kycStatus === 'string' ? (filters.kycStatus as DealerKycStatus | '') : ''
  const params = React.useMemo(
    () => buildApplicationsListParams({ page, pageSize: PAGE_SIZE, search, kycStatus }),
    [page, search, kycStatus],
  )
  const query = useAdminResource<ListResult<DealerRow>>(
    `/api/dealer_onboarding/admin/dealers/applications?${new URLSearchParams(params)}`,
  )

  const columns: ColumnDef<DealerRow>[] = [
    { accessorKey: 'businessName', header: t('dealer_onboarding.admin.businessName', 'Business name') },
    { accessorKey: 'contactEmail', header: t('dealer_onboarding.admin.contactEmail', 'Contact email') },
    { accessorKey: 'state', header: t('dealer_onboarding.admin.state', 'State') },
    {
      accessorKey: 'kycStatus',
      header: t('dealer_onboarding.admin.kycStatus', 'KYC status'),
      cell: ({ row }) => {
        const status = row.original.kycStatus as DealerKycStatus
        return (
          <StatusBadge variant={KYC_STATUS_VARIANT[status] ?? 'neutral'} dot>
            {t(`dealer_onboarding.kycStatus.${status}`, status)}
          </StatusBadge>
        )
      },
    },
  ]

  if (query.error) return <ResourceError error={query.error} retry={() => void query.refetch()} />

  return (
    <DataTable<DealerRow>
      title={t('dealer_onboarding.admin.title', 'Dealer applications')}
      titleHeadingLevel={1}
      entityId="dealer_onboarding:dealer_profile"
      extensionTableId="dealer_onboarding.applications"
      columns={columns}
      data={query.data?.items ?? []}
      isLoading={query.isLoading}
      searchValue={search}
      searchPlaceholder={t('dealer_onboarding.admin.searchPlaceholder', 'Search business name or contact email')}
      onSearchChange={(value) => { setSearch(value); setPage(1) }}
      filters={[{
        id: 'kycStatus',
        label: t('dealer_onboarding.admin.kycStatus', 'KYC status'),
        type: 'select',
        options: DEALER_KYC_STATUSES.map((value) => ({ value, label: t(`dealer_onboarding.kycStatus.${value}`, value) })),
      }]}
      filterValues={filters}
      onFiltersApply={(value) => { setFilters(value); setPage(1) }}
      onFiltersClear={() => { setFilters({}); setPage(1) }}
      emptyState={<p>{t('dealer_onboarding.admin.empty', 'No applications match these filters.')}</p>}
      rowActions={(row) => (
        <RowActions items={[{
          id: 'review',
          label: t('dealer_onboarding.admin.review', 'Review application'),
          href: `/backend/dealers/applications/${row.id}`,
        }]} />
      )}
      onRowClick={(row) => router.push(`/backend/dealers/applications/${row.id}`)}
      pagination={{
        page,
        pageSize: PAGE_SIZE,
        total: query.data?.total ?? 0,
        totalPages: query.data?.totalPages ?? 0,
        onPageChange: setPage,
      }}
    />
  )
}
