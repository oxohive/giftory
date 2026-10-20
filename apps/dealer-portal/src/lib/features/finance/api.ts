/**
 * Fetchers for the dealer-facing `commissions`/`payouts` endpoints, via the BFF proxy's JSON
 * client (`@gift/api-client`'s `request`). Every one of these routes derives `dealerProfileId`
 * from the caller's own session server-side and ignores a caller-supplied value (see
 * `resolveOwnDealerProfileId` in each module's `commands/shared.ts`) — so no function here
 * accepts or forwards a dealer id; there is nothing for a caller to override with a
 * guessed/modified id.
 *
 * Read-only by construction: every export below issues a GET. There is no payout/adjustment
 * recording here (that is the admin-only `payouts/admin/...` surface, out of this app entirely) —
 * mirrors the "append-only, no edit controls" principle already established for the admin ledger
 * UI this session.
 */
import { buildQuery, request } from '@gift/api-client'
import type { CommissionSnapshot, LedgerEntry, PageResult } from '@gift/api-client'
import { buildEarningsQuery, buildLedgerQuery, type LedgerQueryInput, type PageInput } from './query'

export interface LedgerBalanceResponse {
  pendingAmount: number
  totalEarned: number
  currencyCode: string
}

/** `GET /api/commissions/dealer/earnings` — paginated commission snapshots for the caller's own dealer profile. */
export async function fetchEarnings(input: PageInput): Promise<PageResult<CommissionSnapshot>> {
  const query = buildEarningsQuery(input)
  return request<PageResult<CommissionSnapshot>>(`commissions/dealer/earnings${buildQuery(query)}`)
}

/** `GET /api/payouts/dealer/ledger` — paginated ledger entries for the caller's own dealer profile. */
export async function fetchLedger(input: LedgerQueryInput): Promise<PageResult<LedgerEntry>> {
  const query = buildLedgerQuery(input)
  return request<PageResult<LedgerEntry>>(`payouts/dealer/ledger${buildQuery(query)}`)
}

/** `GET /api/payouts/dealer/ledger/balance` — aggregate totals (SQL `SUM`, not a page sum) for the caller's own dealer profile. */
export async function fetchLedgerBalance(): Promise<LedgerBalanceResponse> {
  return request<LedgerBalanceResponse>('payouts/dealer/ledger/balance')
}
