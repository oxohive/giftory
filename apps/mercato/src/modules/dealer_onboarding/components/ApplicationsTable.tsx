'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import type { FilterValues } from '@open-mercato/ui/backend/FilterBar'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DEALER_KYC_STATUSES } from '../lib/constants'
import { ResourceError, useAdminResource, type DealerRow, type ListResult } from './adminShared'

export default function ApplicationsTable() {
  const t = useT(); const router = useRouter()
  const [search, setSearch] = React.useState(''); const [page, setPage] = React.useState(1)
  const [filters, setFilters] = React.useState<FilterValues>({})
  const params = new URLSearchParams({ page: String(page), pageSize: '25', search })
  if (filters.kycStatus) params.set('kycStatus', String(filters.kycStatus))
  const query = useAdminResource<ListResult<DealerRow>>(`/api/dealer_onboarding/admin/dealers/applications?${params}`)
  const columns: ColumnDef<DealerRow>[] = [
    { accessorKey: 'businessName', header: t('dealer_onboarding.admin.businessName', 'Business name') },
    { accessorKey: 'contactEmail', header: t('dealer_onboarding.admin.contactEmail', 'Contact email') },
    { accessorKey: 'state', header: t('dealer_onboarding.admin.state', 'State') },
    { accessorKey: 'kycStatus', header: t('dealer_onboarding.admin.kycStatus', 'KYC status'), cell: ({ row }) => t(`dealer_onboarding.kycStatus.${row.original.kycStatus}`, row.original.kycStatus) },
  ]
  if (query.error) return <ResourceError error={query.error} retry={() => void query.refetch()} />
  return <DataTable<DealerRow> title={t('dealer_onboarding.admin.title', 'Dealer applications')} titleHeadingLevel={1} entityId="dealer_onboarding:dealer_profile" extensionTableId="dealer_onboarding.applications" columns={columns} data={query.data?.items ?? []} isLoading={query.isLoading} searchValue={search} onSearchChange={value => { setSearch(value); setPage(1) }} filters={[{ id: 'kycStatus', label: t('dealer_onboarding.admin.kycStatus', 'KYC status'), type: 'select', options: DEALER_KYC_STATUSES.map(value => ({ value, label: t(`dealer_onboarding.kycStatus.${value}`, value) })) }]} filterValues={filters} onFiltersApply={value => { setFilters(value); setPage(1) }} onFiltersClear={() => { setFilters({}); setPage(1) }} emptyState={<p>{t('dealer_onboarding.admin.empty', 'No applications match these filters.')}</p>} rowActions={row => <RowActions items={[{ id: 'review', label: t('dealer_onboarding.admin.review', 'Review application'), href: `/backend/dealer-applications/${row.id}` }]} />} onRowClick={row => router.push(`/backend/dealer-applications/${row.id}`)} pagination={{ page, pageSize: 25, total: query.data?.total ?? 0, totalPages: query.data?.totalPages ?? 0, onPageChange: setPage }} />
}
