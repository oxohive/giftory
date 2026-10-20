import type { DealerKycStatus } from '../lib/constants'

/**
 * Query-param builder for `GET /api/dealer_onboarding/admin/dealers/applications`
 * (API-CONTRACTS.md's `dealer_onboarding` admin queue route).
 *
 * Kept as a plain, framework-free function — mirrors the precedent in
 * `commissions/components/rulesQuery.ts` — so the list page's search +
 * status filter + pagination behavior is unit-testable without mounting
 * `ApplicationsTable`. The server accepts `kycStatus`, `search`, `page`,
 * `pageSize`, `sortField` (`created_at|updated_at|business_name|kyc_status`)
 * and `sortDir` (`asc|desc`) — see `data/validators.ts`'s
 * `adminApplicationsListSchema`. This function only ever sends keys the
 * server actually understands, and only when they carry a real value — an
 * empty search string or an unset status filter should narrow nothing.
 */
export type ApplicationsListFilters = {
  page: number
  pageSize: number
  search?: string
  kycStatus?: DealerKycStatus | ''
  sortField?: 'created_at' | 'updated_at' | 'business_name' | 'kyc_status'
  sortDir?: 'asc' | 'desc'
}

export function buildApplicationsListParams(filters: ApplicationsListFilters): Record<string, string> {
  const params: Record<string, string> = {
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  }
  const search = filters.search?.trim()
  if (search) params.search = search
  if (filters.kycStatus) params.kycStatus = filters.kycStatus
  if (filters.sortField) params.sortField = filters.sortField
  if (filters.sortDir) params.sortDir = filters.sortDir
  return params
}
