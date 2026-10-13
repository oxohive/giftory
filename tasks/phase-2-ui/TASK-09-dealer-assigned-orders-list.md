# P2-UI-09: Dealer assigned orders list

- Status: Review
- Owner lane: C
- Depends on: P2-UI-01, P2-UI-02, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/orders/page.tsx; src/components/orders/list/; src/lib/features/orders/list.ts

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Build paginated list with status filtering and server-side production-deadline sorting.
- [x] Persist pagination/filter/sort in URL; reset page on filter changes.
- [x] Display meaningful order reference, status, deadline and supported product summary; link using assignment ID.

## Acceptance and verification

- [x] Sorting works across pages, not only within current page.
- [x] Filters survive reload/back navigation and empty results are clear.
- [x] No cross-dealer data is visible; mobile and keyboard usability checked.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Review

### What was built

- `apps/dealer-portal/src/app/(portal)/orders/page.tsx` — server component. Gates with
  `requireApprovedDealer()` (role-agnostic — `dealer_orders.dealer_access` is granted to both
  `dealer:owner` and `dealer:staff` per CONTRACT-HANDOFF.md's permission matrix, unlike
  earnings/ledger/staff which are owner-only), mounts `PortalShell`, wraps the client view in
  `<Suspense>` (required by the App Router for a client component that calls
  `useSearchParams()`).
- `apps/dealer-portal/src/components/orders/list/OrdersListView.tsx` — client orchestrator. The
  URL (`page`/`status`/`sortField`/`sortDir` query params) is the single source of truth for
  pagination/filter/sort state — parsed via `parseOrdersListState`, written via
  `router.push(pathname + buildOrdersListSearch(nextState))`. A status or sort change always
  resets `page` to 1 in the same call. Renders `SessionExpired`/`PermissionDenied` on
  401/403, `LoadingState`/`ErrorNotice` (with retry) for the fetch itself, and a clear
  `EmptyState` with filter-aware copy when the page has zero items.
- `apps/dealer-portal/src/components/orders/list/OrdersFilters.tsx` — status filter (the real
  6-value `ASSIGNMENT_STATUSES` enum) + a single "Sort by" dropdown presenting the real
  `sortField`/`sortDir` pair as 4 friendly options (deadline soonest/latest,
  recently/oldest-assigned), plus a "Clear filter" action when a status filter is active.
- `apps/dealer-portal/src/components/orders/list/OrdersTable.tsx` — a real `<table>` on
  `sm:` and up, a stacked card list below `sm:` (a wide table forced into horizontal scroll is
  harder to scan one-handed than a card per order). Every row/card links to
  `/orders/{assignmentId}` — the ASSIGNMENT id, never `orderId` — with an accessible name
  (`aria-label="View order <reference>"`). All interactive elements are native
  `<a>`/`<select>`/`<button>`, so keyboard tab order and activation work with no custom
  handling.
- `apps/dealer-portal/src/lib/features/orders/list.ts` — the only file this task may add under
  `lib/features/orders/` (owned-paths list names this exact file, not a directory), so every
  query-builder, URL-state parser, fetcher and display helper for this feature lives here:
  `parseOrdersListState`/`buildOrdersListSearch` (URL <-> state), `buildOrdersQuery` (the actual
  `GET .../dealer/orders` query — always sends `sortField`/`sortDir` explicitly, since this
  page's own default, `requiredBy asc`, differs from the backend's bare default, `assignedAt
  desc`), `fetchAssignments`/`fetchAssignmentDetail`/`fetchOrdersListPage`, and
  `summarizeOrderLines`/`orderReferenceLabel`/`enrichAssignments`.

### The list-endpoint enrichment problem, and how it was solved within owned paths

`GET /api/dealer_orders/dealer/orders` (the list route) returns only the bare serialized
`DealerOrderAssignment` row — `id, orderId, ..., requiredBy, status, ...` — no order number and
no product data (API-CONTRACTS.md's "Serialized assignment" shape, confirmed directly against
`dealer_orders/api/dealer/orders/route.ts`'s `serializeAssignment`). Only the per-assignment
*detail* route, `GET .../dealer/orders/{assignmentId}`, returns the enriched, FEAT-010-scoped
projection (`orderNumber`, `lines[]`) that TASK-03 added. This is a real, documented asymmetry
between the two routes, not an oversight — and `dealer_orders/` is outside this task's owned
paths, so it cannot be changed from here.

To satisfy "a meaningful order reference... and a brief product summary" per row without a
backend change, `fetchOrdersListPage` fetches the list page, then calls the detail route for
every visible row **in parallel** (`enrichAssignments`, bounded by the page size — this screen's
fixed `pageSize=25`, backend max 100) to build `orderReference`/`productSummary` for display. A
single row's detail call failing degrades only that row (`detailError: true`, safe fallback
text) rather than failing the whole page. `enrichAssignments` is documented and tested to
**never reorder** `items` — doing so would silently undo the backend's cross-page `requiredBy`/
`assignedAt` ordering.

This is an N+1-per-page request pattern (1 list call + up to 25 detail calls). Flagged as a
real, known cost — acceptable for a page size of 25, but worth a backend addition (a batch
detail endpoint, or enriching the list route itself) if this page's response time becomes a
problem in practice. Not fixed here; `dealer_orders/` is out of this task's owned paths.

### Query-param contract P2-UI-08 depends on

P2-UI-08 (dashboard)'s count cards already link into `/orders?status=<value>` using the real
backend `AssignmentStatus` enum values (`assigned`, `in_production`, `dispatched` — see
`apps/dealer-portal/src/lib/features/dashboard/links.ts`'s `orderListHref`, built before this
task started, against this task's owned-path contract per the orchestrator's instruction). This
task's `parseOrdersListState` reads exactly that shape (`status` query param, same enum values)
— verified by hand against `links.ts`, not re-guessed. No coordination gap found.

### Verified contracts

- `GET /api/dealer_orders/dealer/orders` — `page`/`pageSize`/`status`/`sortField`
  (`assignedAt`\|`requiredBy`)/`sortDir`, `{items,total,page,pageSize}` — confirmed directly
  against `dealer_orders/api/dealer/orders/route.ts` and `data/validators.ts`'s
  `assignmentListQuerySchema`. Already allow-listed in `src/lib/http/allowlist.ts` (lane
  A/P2-UI-01's file, not touched here) for `GET`.
- `GET /api/dealer_orders/dealer/orders/{assignmentId}` — `{assignment:{assignmentId, orderId,
  orderNumber, status, statusNote, statusUpdatedAt, requiredBy, assignedAt, updatedAt, lines[],
  shipping}}` — confirmed against `dealer_orders/api/dealer/orders/[id]/route.ts` and
  `commands/assignments.ts`'s `buildDealerOrderDetail`/`lib/orderDetails.ts`. Already
  allow-listed for `GET`.
- Both routes derive `dealerProfileId` from the session (`resolveOwnDealerProfileId`) and ignore
  any caller-supplied value — confirmed by reading `commands/shared.ts` and its
  `dealerScope.test.ts` fail-closed coverage (unit-mocked EM, not a live DB — see "Residual
  gaps" below for what that does and doesn't prove).
- Real `ASSIGNMENT_STATUSES` enum (`assigned`, `acknowledged`, `in_production`,
  `ready_for_dispatch`, `dispatched`, `cancelled`) — confirmed against
  `dealer_orders/lib/constants.ts`.

### Commands and results

- `npm run typecheck` — clean (0 errors).
- `npm run lint` — 0 errors; 2 pre-existing warnings in `components/auth/LogoutButton.tsx` and
  `ResetPasswordForm.tsx` (files this task never touched).
- `npm run build` — succeeds; `/orders` registers as a dynamic (`ƒ`) route with no
  missing-Suspense-boundary warning.
- `npm run test` (`node --test tests/*.test.mjs`) — baseline at the start of this task's session
  was **109/109** (matches the task prompt's stated baseline). This task added 3 new test files
  (`tests/orders-list-state.test.mjs`, `tests/orders-list-data.test.mjs`,
  `tests/orders-list-isolation.test.mjs`, 32 tests total, all passing) covering: URL state
  parse/build round-tripping and defaulting (including the deliberate divergence between this
  page's own default sort and the backend's bare default); the real query shape sent to
  `GET .../dealer/orders`; `summarizeOrderLines`/`orderReferenceLabel` display logic against
  realistic fixtures; `enrichAssignments`/`fetchOrdersListPage` behavior against a mocked
  `fetch` returning real contract-shaped JSON (not a mock of this module's own functions) —
  including a case proving a single row's detail-fetch failure degrades only that row, a case
  proving the enriched result preserves a deliberately NOT-pre-sorted backend response order
  exactly, and a case proving two different pages of the same view request identical
  `sortField`/`sortDir` (the sort never drifts mid-browse); and a static source scan (mirroring
  `tests/finance-isolation.test.mjs`'s existing pattern) proving no file in this task's owned
  surface ever references `dealerProfileId`, reads a dealer id from route params/query string,
  or calls `.sort()` on a fetched list. Full suite at the end of this task's session:
  **200/200** — the gap between 109 and 200 beyond this task's own 32 is concurrent sibling-lane
  work (an onboarding feature's test files) landing in this shared checkout during the same
  session, not this task's; every test this task added and every pre-existing test both pass.

### Residual gaps / required coordination

1. **No live-DB, multi-page cross-sort fixture test exists anywhere in this repo for
   `GET .../dealer/orders`.** The acceptance criterion "construct a fixture with enough rows to
   span 2+ pages and verify ordering holds" is satisfied at two different levels, neither of
   which is a live-database integration test: (a) code-level — confirmed `sortField`/`sortDir`
   are forwarded directly into `em.findAndCount`'s `orderBy` + `limit`/`offset`
   (`dealer_orders/api/dealer/orders/route.ts`), which is DB-level ORDER BY-then-paginate, not
   in-memory pagination — cross-page correctness is structurally guaranteed by Postgres here,
   not something this task's own (client-only) tests could meaningfully re-prove with a mocked
   EM; (b) this task's own tests prove the *client* never undoes that ordering (no `.sort()`
   anywhere in owned files; `enrichAssignments` preserves a deliberately out-of-order fixture
   exactly; identical sort params sent for page 1 and page 2). The existing backend test
   (`dealer_orders/__tests__/listSorting.test.ts`, written by P2-UI-03) only asserts Zod schema
   parsing of `sortField`/`sortDir`, not actual multi-row ordering against a real or fixture
   dataset. If a live-DB fixture test is wanted for full confidence, that is a `dealer_orders/`
   addition — outside this task's owned paths — flagged for TASK-17 (integration verification)
   or the `dealer_orders`-owning lane.
2. **The list-endpoint enrichment N+1 pattern** (see above) — a real, bounded (<=25 requests per
   page load) cost, not a correctness problem, but worth revisiting if `dealer_orders/` ever
   adds a batch-detail or list-with-product-summary endpoint.
3. Cross-dealer isolation for this screen rests entirely on the backend's
   `resolveOwnDealerProfileId` (verified by code-reading + that function's own unit tests, which
   mock the `EntityManager` rather than exercising a real Postgres instance with two real
   dealers). This task's own tests confirm the UI never offers a way to override it (no
   `dealerProfileId` anywhere in the owned surface, no dealer-id query/route-param reads) — true
   live-session, two-real-dealer browser verification is an integration-level concern (TASK-17),
   not reproducible from this task's owned paths alone.
4. P2-UI-10 (`/orders/[id]`) is the order-detail page these rows link to — not built yet, by
   design (sibling task, not started). Clicking through today will 404 until that task lands;
   this is expected, not a bug in this task's work.

### Ready for dependent tasks

Yes. The `/orders` route is built, gated, tested, and uses only the verified, already-allow-
listed `dealer_orders` dealer contract. P2-UI-08's `orderListHref('/orders?status=...')`
contract is satisfied as built (no changes needed on either side). The one real caveat is #1
above: deadline-sort correctness across pages is verified by code-reading + client-side tests,
not by a live multi-row database fixture, because that would require touching `dealer_orders/`
test files outside this task's owned paths — recorded as a named follow-up for TASK-17, not a
silent gap.
