/**
 * Dealer dashboard (P2-UI-08). Types for the dashboard's three real backend sources, documented
 * in tasks/phase-2-ui/API-CONTRACTS.md's "Dashboard aggregates" section and the UI-task mapping
 * table (TASK-08 row): the `dealer_orders` aggregate (counts), `dealer_org_rbac`'s profile
 * (capabilities.maxDailyCapacity, for "available capacity"), and `dealer_orders`' own order list
 * (for "recent activity" — there is no dedicated recent-activity endpoint; the most recently
 * assigned orders, fetched from the real, already-implemented list endpoint, are the only honest
 * source for this section — see queries.ts).
 *
 * Re-exports `Assignment`/`AssignmentStatus`/`DealerCapabilities` from `@gift/api-client` instead
 * of redeclaring them, so this feature never drifts from the shared client's contract types.
 *
 * Type-only file by convention: every export here is a type (or a type-only re-export), never a
 * runtime value. That matters beyond style — queries.ts and links.ts are exercised directly by
 * `node --test` (tests/dashboard-queries.test.mjs, tests/dashboard-links.test.mjs), and this
 * app's `@/...` path alias is a TypeScript-only construct with no Node runtime mapping; a plain
 * `node --test` run erases `import type { ... } from '@/...'` before resolution is ever
 * attempted (confirmed empirically against this app's existing lib/auth/access.ts, which already
 * relies on the same erasure for its own `@/components/layout/nav-items` type import) but would
 * throw `ERR_MODULE_NOT_FOUND` on a real VALUE import through the same alias. Keeping this file
 * 100% type-only is what makes it safe to import from those two test-loaded files.
 */
import type { Assignment, AssignmentStatus, DealerCapabilities } from '@gift/api-client'

export type { Assignment, AssignmentStatus, DealerCapabilities }

/**
 * GET .../dealer_orders/dealer/dashboard — verified against
 * apps/mercato/src/modules/dealer_orders/lib/dashboard.ts (`computeDealerDashboard`), not guessed:
 * one SQL aggregate (`COUNT(*) FILTER(...)`) scoped to the caller's own dealerProfileId.
 * `dispatchedThisWeek` is `status='dispatched' AND status_updated_at >= weekStartsAt`, where
 * `weekStartsAt` is the exact Asia/Kolkata week boundary (most recent Monday 00:00 IST) the
 * server used, returned so the client can render it rather than recomputing it.
 */
export interface DashboardAggregate {
  pendingAcknowledgment: number
  inProduction: number
  dispatchedThisWeek: number
  weekStartsAt: string
  timezone: string
}

/**
 * Which real assignment `status` value each count card corresponds to — verified against the
 * identical SQL filter in `computeDealerDashboard` (pendingAcknowledgment = status='assigned',
 * inProduction = status='in_production', dispatchedThisWeek = status='dispatched') and against
 * `assignmentListQuerySchema`'s `status` field (apps/mercato/.../dealer_orders/data/validators.ts),
 * which the dealer orders-list route (`GET .../dealer/orders`) actually filters by server-side.
 * TASK-09 (the orders list page, apps/dealer-portal/src/app/(portal)/orders/page.tsx, not yet
 * built) is expected to read a `status` query param and forward it to that same endpoint — so
 * `?status=<value>` is the real, backend-supported filter shape, not a guessed one. The literal
 * mapping lives in links.ts (a value, not a type, so it cannot live in this type-only file).
 */
export type DashboardCountKey = 'pendingAcknowledgment' | 'inProduction' | 'dispatchedThisWeek'

export interface RecentActivityResult {
  items: Assignment[]
  total: number
}

/** "Available capacity" = capabilities.maxDailyCapacity from `GET .../dealer_org_rbac/dealer/profile`. */
export interface CapacityView {
  configured: boolean
  maxDailyCapacity: number
}
