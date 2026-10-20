/**
 * Pure query-builders for the dealer-facing commissions/payouts list endpoints. Kept separate
 * from api.ts (which does the actual fetch) so this logic runs under plain `node --test` against
 * real contract fixtures, not a mock of `fetch`.
 *
 * Deliberately narrow: only params the real endpoints document in
 * tasks/phase-2-ui/API-CONTRACTS.md are ever produced here.
 *
 * `dealerProfileId` is never an input to either builder. Both dealer-facing endpoints
 * (`GET /api/commissions/dealer/earnings`, `GET /api/payouts/dealer/ledger`) derive the caller's
 * own dealer profile from the session server-side and ignore a caller-supplied value entirely
 * (see `resolveOwnDealerProfileId` in each module's `commands/shared.ts`) — so there is nothing
 * for this UI to accidentally override with a guessed/modified dealer id in the first place.
 */
import type { LedgerDirection, LedgerEntryType } from '@gift/api-client'

export const DEFAULT_PAGE_SIZE = 25
const MIN_PAGE_SIZE = 1
const MAX_PAGE_SIZE = 100

export interface PageInput {
  page: number
  pageSize?: number
}

function normalizePage(page: number): number {
  return Number.isInteger(page) && page >= 1 ? page : 1
}

function normalizePageSize(pageSize: number | undefined): number {
  if (pageSize === undefined || !Number.isInteger(pageSize)) return DEFAULT_PAGE_SIZE
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, pageSize))
}

/**
 * `GET /api/commissions/dealer/earnings` supports `orderId`/`assignmentId` in addition to
 * pagination, but neither is exposed as a UI filter here — a dealer typing a raw order/assignment
 * UUID into a search box is not a real workflow, so no control is built for it. Only page/pageSize
 * are ever sent.
 */
export function buildEarningsQuery(input: PageInput): Record<string, number> {
  return { page: normalizePage(input.page), pageSize: normalizePageSize(input.pageSize) }
}

export const LEDGER_ENTRY_TYPES: readonly LedgerEntryType[] = [
  'commission_earned',
  'payout_disbursed',
  'adjustment_credit',
  'adjustment_debit',
]

export const LEDGER_DIRECTIONS: readonly LedgerDirection[] = ['credit', 'debit']

export interface LedgerQueryInput extends PageInput {
  entryType?: LedgerEntryType | ''
  direction?: LedgerDirection | ''
}

/**
 * `GET /api/payouts/dealer/ledger` — page/pageSize plus the two real filters the endpoint
 * documents (`entryType`, `direction`). An empty-string or otherwise-unrecognized value is
 * dropped rather than sent, so a stray `?entryType=` never reaches the backend as a filter.
 */
export function buildLedgerQuery(input: LedgerQueryInput): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: normalizePage(input.page),
    pageSize: normalizePageSize(input.pageSize),
  }
  if (input.entryType && LEDGER_ENTRY_TYPES.includes(input.entryType as LedgerEntryType)) {
    query.entryType = input.entryType
  }
  if (input.direction && LEDGER_DIRECTIONS.includes(input.direction as LedgerDirection)) {
    query.direction = input.direction
  }
  return query
}
