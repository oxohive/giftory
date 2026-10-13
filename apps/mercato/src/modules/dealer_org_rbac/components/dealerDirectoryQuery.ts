/**
 * Query-param builder for `GET /api/dealer_org_rbac/admin/dealers`
 * (API-CONTRACTS.md's `dealer_org_rbac` admin directory route — "Verified
 * working"). The route's real query schema (`listQuerySchema` in
 * `../api/admin/dealers/route.ts`) accepts exactly `page`, `pageSize`,
 * `search`, and `state` — there is no `kycStatus` param (the route always
 * filters to `kycStatus: 'approved'` server-side) and no product-type
 * param of any kind.
 *
 * Per TASK-12's own explicit instruction ("do not present a product-type or
 * KYC-document filter unless real server support for it exists"), this
 * builder only ever emits keys the server understands, and this file is the
 * single place that decides which filters the directory list offers — kept
 * outside React so the decision is unit-testable without mounting
 * `DealersTable`.
 *
 * `state` is deliberately treated as free text, not a closed enum. The
 * dealer's business-address `state` field (`dealer_onboarding/data/
 * validators.ts`'s `indianStateSchema`) is validated only by a
 * `^[A-Z]{2,3}$` regex — there is no canonical state list backing it,
 * unlike `dealer_org_rbac`'s own `serviceableStates` capability field
 * (closed `IN-XX` enum, see `lib/constants.ts`'s `INDIAN_STATE_CODES`).
 * Those are two different vocabularies for two different things (business
 * address vs. capability coverage) — building a dropdown for this filter
 * from `INDIAN_STATE_CODES` would silently present options the field was
 * never validated against. A plain text filter matches what the server
 * actually does (`where.state = query.state`, an exact string match).
 */
export type DealerDirectoryFilters = {
  page: number
  pageSize: number
  search?: string
  state?: string
}

export function buildDealerDirectoryListParams(filters: DealerDirectoryFilters): Record<string, string> {
  const params: Record<string, string> = {
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  }
  const search = filters.search?.trim()
  if (search) params.search = search
  const state = filters.state?.trim()
  if (state) params.state = state
  return params
}
