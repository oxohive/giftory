/**
 * Data layer for the dealer-facing assigned-orders list (`/orders`, TASK-09). Per this task's
 * exact owned-paths list, `src/lib/features/orders/` contains only this ONE file — unlike the
 * finance feature (query.ts + api.ts + display.ts split), every query-builder, fetcher, and
 * display helper for the orders list lives here; React/state-management code lives under
 * `src/components/orders/list/` instead (the other owned path).
 *
 * `dealerProfileId` is never an input anywhere in this file, for the same reason finance's
 * query.ts documents: `GET /api/dealer_orders/dealer/orders` and
 * `GET /api/dealer_orders/dealer/orders/{assignmentId}` both derive the caller's own dealer
 * profile from the session server-side (`resolveOwnDealerProfileId`, verified against
 * `dealer_orders/commands/shared.ts` and its dedicated `dealerScope.test.ts` fail-closed
 * coverage) and ignore any caller-supplied value — there is nothing here for a caller to override
 * with a guessed/modified dealer id.
 */
import { buildQuery, request } from '@gift/api-client'
import type { Assignment, AssignmentStatus, PageResult } from '@gift/api-client'

export const DEFAULT_PAGE_SIZE = 25

/**
 * Real backend enum — `apps/mercato/src/modules/dealer_orders/lib/constants.ts`'s
 * `ASSIGNMENT_STATUSES`, which is exactly what `assignmentListQuerySchema.status` accepts on
 * `GET .../dealer/orders`. Every value this UI's status filter offers is one the backend
 * actually recognizes; `cancelled` is included deliberately — a dealer may want to filter down to
 * cancelled assignments to confirm one is no longer their responsibility.
 */
export const ORDER_STATUS_FILTERS: readonly AssignmentStatus[] = [
  'assigned',
  'acknowledged',
  'in_production',
  'ready_for_dispatch',
  'dispatched',
  'cancelled',
]

/** Real backend enum — `assignmentListQuerySchema.sortField`. */
export type OrderSortField = 'assignedAt' | 'requiredBy'
export type OrderSortDir = 'asc' | 'desc'

export interface OrdersListState {
  page: number
  status: AssignmentStatus | ''
  sortField: OrderSortField
  sortDir: OrderSortDir
}

/**
 * This page's own default view sorts by the production deadline, soonest first — distinct from
 * the backend's own default (`assignedAt desc`, unchanged for callers that omit `sortField`/
 * `sortDir` entirely, e.g. the dashboard's "recent activity" card). Because the two defaults
 * differ, `buildOrdersQuery` below always sends `sortField`/`sortDir` explicitly — it must never
 * rely on omission falling back to the right thing.
 */
export const DEFAULT_ORDERS_LIST_STATE: OrdersListState = {
  page: 1,
  status: '',
  sortField: 'requiredBy',
  sortDir: 'asc',
}

export const SORT_OPTIONS = [
  { key: 'requiredBy:asc', sortField: 'requiredBy', sortDir: 'asc', label: 'Deadline (soonest first)' },
  { key: 'requiredBy:desc', sortField: 'requiredBy', sortDir: 'desc', label: 'Deadline (latest first)' },
  { key: 'assignedAt:desc', sortField: 'assignedAt', sortDir: 'desc', label: 'Recently assigned' },
  { key: 'assignedAt:asc', sortField: 'assignedAt', sortDir: 'asc', label: 'Oldest assigned' },
] as const satisfies readonly { key: string; sortField: OrderSortField; sortDir: OrderSortDir; label: string }[]

export function sortKeyFor(sortField: OrderSortField, sortDir: OrderSortDir): string {
  return `${sortField}:${sortDir}`
}

export function sortOptionForKey(key: string): (typeof SORT_OPTIONS)[number] {
  return SORT_OPTIONS.find((option) => option.key === key) ?? SORT_OPTIONS[0]
}

function isAssignmentStatus(value: string): value is AssignmentStatus {
  return (ORDER_STATUS_FILTERS as readonly string[]).includes(value)
}

function normalizePage(raw: string | null): number {
  if (raw === null) return 1
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

function normalizeSortField(raw: string | null): OrderSortField {
  return raw === 'assignedAt' || raw === 'requiredBy' ? raw : DEFAULT_ORDERS_LIST_STATE.sortField
}

function normalizeSortDir(raw: string | null): OrderSortDir {
  return raw === 'asc' || raw === 'desc' ? raw : DEFAULT_ORDERS_LIST_STATE.sortDir
}

/**
 * Parses the `/orders` URL's query string into validated state, defaulting anything missing or
 * invalid rather than ever forwarding a bad value to the backend. The URL IS the state — this is
 * the one function both the component (to render) and the query builder (to fetch) read from, so
 * a reload or a browser back-navigation restores the exact same view by construction, not by a
 * separate client cache this task would otherwise have to keep in sync by hand.
 */
export function parseOrdersListState(searchParams: URLSearchParams): OrdersListState {
  const rawStatus = searchParams.get('status')
  return {
    page: normalizePage(searchParams.get('page')),
    status: rawStatus && isAssignmentStatus(rawStatus) ? rawStatus : '',
    sortField: normalizeSortField(searchParams.get('sortField')),
    sortDir: normalizeSortDir(searchParams.get('sortDir')),
  }
}

/**
 * Serializes state back into a query string for `router.push`/`.replace`. A param is omitted
 * when it equals this page's own default so the URL stays as readable as the unfiltered case
 * (`/orders`, not `/orders?status=&sortField=requiredBy&sortDir=asc&page=1`) — this is purely
 * about what the address bar shows; `buildOrdersQuery` (below) is what actually talks to the
 * backend and never relies on an omitted param meaning the same thing there.
 */
export function buildOrdersListSearch(state: OrdersListState): string {
  const params = new URLSearchParams()
  if (state.status) params.set('status', state.status)
  if (state.sortField !== DEFAULT_ORDERS_LIST_STATE.sortField) params.set('sortField', state.sortField)
  if (state.sortDir !== DEFAULT_ORDERS_LIST_STATE.sortDir) params.set('sortDir', state.sortDir)
  if (state.page > 1) params.set('page', String(state.page))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * The actual `GET .../dealer/orders` query — always sends `sortField`/`sortDir` explicitly
 * (never omitted, unlike the URL's own display form above) since this page's default differs
 * from the backend's. `pageSize` is fixed; this screen has no pageSize control.
 */
export function buildOrdersQuery(state: OrdersListState): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: Number.isInteger(state.page) && state.page >= 1 ? state.page : 1,
    pageSize: DEFAULT_PAGE_SIZE,
    sortField: state.sortField,
    sortDir: state.sortDir,
  }
  if (state.status) query.status = state.status
  return query
}

/** `GET /api/dealer_orders/dealer/orders` — the caller's own assignments, server-sorted/paged. */
export async function fetchAssignments(state: OrdersListState): Promise<PageResult<Assignment>> {
  const query = buildOrdersQuery(state)
  return request<PageResult<Assignment>>(`dealer_orders/dealer/orders${buildQuery(query)}`)
}

export interface OrderDetailLine {
  id: string
  productId: string | null
  variantId: string | null
  name: string | null
  quantity: number
  giftMessage: string | null
  productionRequirements: Record<string, unknown> | null
}

export interface OrderDetailShipping {
  city: string | null
  pincode: string | null
}

/**
 * The safe, FEAT-010-scoped projection `GET .../dealer/orders/{assignmentId}` returns — see
 * tasks/phase-2-ui/API-CONTRACTS.md "Safe dealer order detail" and
 * `dealer_orders/commands/assignments.ts`'s `buildDealerOrderDetail`. Not yet one of
 * `@gift/api-client`'s stubbed interfaces (only the bare list-row `Assignment` shape is there),
 * so declared locally rather than widening a shared type this task doesn't own.
 */
export interface DealerOrderDetail {
  assignmentId: string
  orderId: string
  orderNumber: string | null
  status: AssignmentStatus
  statusNote: string | null
  statusUpdatedAt: string
  requiredBy: string | null
  assignedAt: string
  updatedAt: string
  lines: OrderDetailLine[]
  shipping: OrderDetailShipping
}

/** `GET /api/dealer_orders/dealer/orders/{assignmentId}` — note: ASSIGNMENT id, never the order id. */
export async function fetchAssignmentDetail(assignmentId: string): Promise<DealerOrderDetail> {
  const { assignment } = await request<{ assignment: DealerOrderDetail }>(
    `dealer_orders/dealer/orders/${assignmentId}`,
  )
  return assignment
}

/**
 * "Mug x2, Photo frame x1 +1 more" — first two lines by name/quantity, with a count of anything
 * beyond that. A line with no catalog name (a deleted/legacy product) falls back to a generic
 * "Item" label rather than rendering blank.
 */
export function summarizeOrderLines(lines: OrderDetailLine[]): string {
  if (lines.length === 0) return 'No product details'
  const shown = lines.slice(0, 2).map((line) => `${line.name ?? 'Item'} x${line.quantity}`)
  const extra = lines.length - shown.length
  return extra > 0 ? `${shown.join(', ')} +${extra} more` : shown.join(', ')
}

/**
 * A dealer-meaningful reference for the order — the real order number, never the raw order/
 * assignment UUID. `orderNumber` is only ever null for a data-integrity edge case (the
 * underlying `sales_orders` row could not be read); even then this still avoids printing a bare
 * UUID, labeling the gap explicitly instead.
 */
export function orderReferenceLabel(orderNumber: string | null): string {
  return orderNumber ?? 'Order reference unavailable'
}

export interface EnrichedOrderRow {
  /** Routes to `/orders/[id]` — the ASSIGNMENT id (P2-UI-10's page, not yet built). */
  assignmentId: string
  orderReference: string
  status: AssignmentStatus
  requiredBy: string | null
  productSummary: string
  /** True when this one row's detail fetch failed — the row still renders (with safe
   *  fallback text) rather than failing the whole page over one bad row. */
  detailError: boolean
}

/**
 * The list endpoint (`GET .../dealer/orders`) returns only the bare assignment row — no order
 * number or product summary; that enrichment exists only on the per-assignment detail route (see
 * API-CONTRACTS.md's "Safe dealer order detail" — a deliberate, documented asymmetry between the
 * list and detail routes, not an oversight this task can fix, since `dealer_orders/` is outside
 * this task's owned paths). Bounded by the current page's size (<=100, this UI's default 25),
 * this fetches each visible row's detail in parallel to build the "meaningful reference + product
 * summary" the task requires. A single row's detail failing degrades only that row.
 *
 * Deliberately preserves `items`' order exactly as received — this function must never sort or
 * reorder, since doing so would silently undo the backend's cross-page `requiredBy`/`assignedAt`
 * ordering the moment there is more than one page of results.
 */
export async function enrichAssignments(items: Assignment[]): Promise<EnrichedOrderRow[]> {
  return Promise.all(
    items.map(async (item): Promise<EnrichedOrderRow> => {
      try {
        const detail = await fetchAssignmentDetail(item.id)
        return {
          assignmentId: item.id,
          orderReference: orderReferenceLabel(detail.orderNumber),
          status: item.status,
          requiredBy: item.requiredBy,
          productSummary: summarizeOrderLines(detail.lines),
          detailError: false,
        }
      } catch {
        return {
          assignmentId: item.id,
          orderReference: 'Order reference unavailable',
          status: item.status,
          requiredBy: item.requiredBy,
          productSummary: 'Product details unavailable',
          detailError: true,
        }
      }
    }),
  )
}

export interface OrdersListPage {
  items: EnrichedOrderRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * The single fetch the orders list view calls: the server-sorted/paged assignment list, enriched
 * per-row. `items`' order is exactly the backend's — see `enrichAssignments`'s doc comment.
 */
export async function fetchOrdersListPage(state: OrdersListState): Promise<OrdersListPage> {
  const page = await fetchAssignments(state)
  const items = await enrichAssignments(page.items)
  return { items, total: page.total, page: page.page, pageSize: page.pageSize }
}
