/**
 * Query-param builder for `GET /api/commissions/admin/commission/rules`.
 *
 * API-CONTRACTS.md documents a real, reproducible backend bug: the route's
 * `activeOnly` schema is `z.coerce.boolean().default(true)`, which runs
 * JS `Boolean(value)` on whatever string the query param carries. Any
 * non-empty string — including the literal text `"false"` — coerces to
 * `true`. The *only* way to include deactivated rules is to send the key
 * with an EMPTY value (`?activeOnly=`, which `Boolean('')` correctly
 * evaluates to `false`), or omit the key entirely to get the default
 * (`true` — active rules only).
 *
 * This function is the single place that encodes that footgun so no
 * component ever hand-rolls `activeOnly: String(includeDeactivated)` (which
 * would silently re-introduce the bug by sending the literal string
 * `"false"`).
 */
export type RulesListFilters = {
  page: number
  pageSize: number
  dealerProfileId?: string
  productTypeCode?: string
  /** true = show both active and deactivated rules. */
  includeDeactivated: boolean
}

export function buildRulesListParams(filters: RulesListFilters): Record<string, string> {
  const params: Record<string, string> = {
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  }
  if (filters.dealerProfileId) params.dealerProfileId = filters.dealerProfileId
  if (filters.productTypeCode) params.productTypeCode = filters.productTypeCode
  if (filters.includeDeactivated) {
    // Deliberately an EMPTY string, never the literal text "false" — see
    // the module doc comment above.
    params.activeOnly = ''
  }
  // When includeDeactivated is false, omit `activeOnly` entirely and rely
  // on the server's own default (`true` — active rules only).
  return params
}
