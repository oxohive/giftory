/**
 * Pure URL builder — no Next/fetch here, so this runs under plain `node --test` (see
 * tests/dashboard-links.test.mjs). Builds the href each dashboard count card links to: the
 * dealer orders list (TASK-09's `apps/dealer-portal/src/app/(portal)/orders/page.tsx`, not yet
 * built as of this task), pre-filtered by the exact `status` value the backend's
 * `assignmentListQuerySchema` accepts on `GET /api/dealer_orders/dealer/orders` — see
 * types.ts's `DashboardCountKey` doc comment for the source verification. This task does not
 * implement the orders list page itself; it only needs to point at a URL shape that page is
 * contracted to read.
 *
 * The status-key map is a runtime VALUE, so (unlike types.ts) it must be defined directly in
 * this file rather than imported from elsewhere — this file is loaded directly by `node --test`,
 * whose plain ESM resolver cannot follow this app's `@/...` path alias for a value import (only
 * type-only imports through that alias are erased before resolution is attempted). One literal
 * object beats a cross-file import that breaks under test.
 */
import type { AssignmentStatus, DashboardCountKey } from '@/lib/features/dashboard/types'

const STATUS_BY_CARD = {
  pendingAcknowledgment: 'assigned',
  inProduction: 'in_production',
  dispatchedThisWeek: 'dispatched',
} as const satisfies Record<DashboardCountKey, AssignmentStatus>

export function orderListHref(card: DashboardCountKey): string {
  return `/orders?status=${STATUS_BY_CARD[card]}`
}
