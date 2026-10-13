/**
 * Client-side data access for the dealer dashboard. Thin glue around `@gift/api-client`'s
 * `request()` (the dealer-portal's one BFF-proxy client, `/api/om/<path>` -> apps/mercato
 * `/api/<path>`) — deliberately NOT split into "pure logic in one file, fetch glue in another"
 * the way links.ts is: this file is itself loaded directly by `node --test`
 * (tests/dashboard-queries.test.mjs), and that test runner's plain ESM resolver cannot follow
 * this app's `@/...` path alias for a runtime VALUE import (confirmed empirically — only
 * type-only imports through the alias are erased before resolution is attempted, same
 * constraint links.ts's own comment documents). So `fetchCapacity`'s tiny capacity-view
 * computation lives inline here rather than in a separately-imported module.
 *
 * KNOWN BLOCKER (flagged in this task's handoff, not fixable from this task's owned paths):
 * `fetchDashboardAggregate`'s path, `dealer_orders/dealer/dashboard`, is NOT yet present in
 * `src/lib/http/allowlist.ts` (owned by lane A / P2-UI-01) — every other path this feature calls
 * (`dealer_org_rbac/dealer/profile`, `dealer_orders/dealer/orders`) already is. Until that one
 * entry is added, a real browser request through the proxy 404s for this endpoint only; the
 * dashboard's counts section will show its real error+retry state (not a crash) until then. The
 * request below is still built against the exact, verified contract — nothing here is a guess.
 */
import { buildQuery, request, type Assignment } from '@gift/api-client'
import type { CapacityView, DashboardAggregate, DealerCapabilities, RecentActivityResult } from '@/lib/features/dashboard/types'

/** Small and fixed — this is a "what happened lately" glance, not a paginated feed (that is
 *  TASK-09's orders list page's job). */
const RECENT_ACTIVITY_PAGE_SIZE = 5

export async function fetchDashboardAggregate(): Promise<DashboardAggregate> {
  return request<DashboardAggregate>('dealer_orders/dealer/dashboard')
}

interface DealerOrgProfileResponse {
  capabilities?: DealerCapabilities
}

/**
 * `capabilities.maxDailyCapacity` defaults to `0` for a dealer who has never saved capabilities
 * (API-CONTRACTS.md: "defaults []/0/1/null" on `GET .../dealer_org_rbac/dealer/profile`). Zero is
 * indistinguishable, in the data itself, from "not configured yet" — report it as not-configured
 * rather than rendering "0 orders/day", which would misrepresent an absent setting as a
 * deliberate one (this task's "show unavailable data honestly" requirement).
 */
export async function fetchCapacity(): Promise<CapacityView> {
  const profile = await request<DealerOrgProfileResponse>('dealer_org_rbac/dealer/profile')
  const maxDailyCapacity = profile.capabilities?.maxDailyCapacity ?? 0
  return { configured: maxDailyCapacity > 0, maxDailyCapacity }
}

export async function fetchRecentActivity(): Promise<RecentActivityResult> {
  const query = buildQuery({
    sortField: 'assignedAt',
    sortDir: 'desc',
    page: 1,
    pageSize: RECENT_ACTIVITY_PAGE_SIZE,
  })
  const page = await request<{ items: Assignment[]; total: number }>(`dealer_orders/dealer/orders${query}`)
  return { items: page.items, total: page.total }
}
