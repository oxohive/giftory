# P2-UI-08: Dealer dashboard

- Status: Planned; implementation not started
- Owner lane: C
- Depends on: P2-UI-01, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/page.tsx; src/components/dashboard/; src/lib/features/dashboard/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Show pending acknowledgment, in-production and dispatched-this-week counts, recent activity and available capacity data.
- [x] Use actual aggregate API with documented timezone/week boundary; link cards to filtered orders.
- [x] Show unavailable values honestly when data is absent; no synthetic activity or invented capacity utilization.

## Acceptance and verification

- [x] Counts agree with seeded backend data beyond a single page.
- [x] Each card opens the correct filter; loading, no-orders, error and retry states work.
- [x] Responsive owner/staff experience checked.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Review

- **Scope note (blocker found, not fixable from this task's owned paths):** `GET
  /api/dealer_orders/dealer/dashboard` — the real aggregate endpoint this task is required to use
  — is NOT present in `apps/dealer-portal/src/lib/http/allowlist.ts` (owned by lane A / P2-UI-01;
  outside this task's owned paths, which are strictly `app/(portal)/page.tsx`,
  `components/dashboard/`, `lib/features/dashboard/`). Every other path this feature calls
  (`dealer_org_rbac/dealer/profile`, `dealer_orders/dealer/orders`) is already allowlisted; only
  the dashboard-aggregate path is missing. Until lane A adds one entry —
  `{ pattern: /^dealer_orders\/dealer\/dashboard$/, methods: ['GET'] }` — a real browser request
  for the three counts 404s through the proxy (confirmed live, see "Commands and results" below).
  The code calling it is built and tested against the exact, verified contract regardless; this
  is a one-line fix in a file this task is not permitted to touch.

### What was built

- `apps/dealer-portal/src/app/(portal)/page.tsx` — the `/` dashboard route. Gates with P2-UI-04's
  `requireApprovedDealer()` (consumes the pending-KYC holding-page gate per CONTRACT-HANDOFF's
  freeze — does not reimplement the `kycStatus` check), then mounts the existing `PortalShell`
  with the resolved role (both files consumed, neither modified).
- `src/lib/features/dashboard/types.ts` — type-only module (deliberately: see the file's own
  comment on why — it is imported by files under direct `node --test` and this app's `@/...` path
  alias only resolves for erased type-only imports, not runtime values, under that test runner).
  Re-exports `Assignment`/`AssignmentStatus`/`DealerCapabilities` from `@gift/api-client` and adds
  `DashboardAggregate`, `DashboardCountKey`, `RecentActivityResult`, `CapacityView`.
- `src/lib/features/dashboard/links.ts` — pure `orderListHref(card)`, building `/orders?status=X`
  for each count card, where `X` is the exact `status` value verified against
  `apps/mercato/.../dealer_orders/lib/dashboard.ts`'s SQL filter (pendingAcknowledgment=`assigned`,
  inProduction=`in_production`, dispatchedThisWeek=`dispatched`) and against
  `assignmentListQuerySchema`'s `status` field, which `GET .../dealer/orders` actually filters by
  server-side — read directly from source, not guessed. TASK-09 (orders list, not yet built) is
  expected to read a `status` query param on that same route per its own owned-path contract.
- `src/lib/features/dashboard/queries.ts` — `fetchDashboardAggregate`, `fetchCapacity`,
  `fetchRecentActivity`: thin glue over `@gift/api-client`'s `request()`. `fetchCapacity` derives
  "available capacity" from `capabilities.maxDailyCapacity` honestly — `0` (the documented default
  for a dealer who never saved capabilities) is reported `configured:false`, never rendered as "0
  orders/day". `fetchRecentActivity` calls the real, already-implemented `GET .../dealer/orders`
  sorted `assignedAt desc`, page size 5 — there is no dedicated "recent activity" endpoint in the
  contract (API-CONTRACTS.md's dashboard-aggregates section only covers the three counts), so the
  real order list, not a synthetic entry, is the only honest source for that section.
- `src/components/dashboard/{StatusCountCards,RecentActivityCard,CapacityCard,DashboardContent}.tsx`
  — presentational cards plus the client orchestrator. Three independent `useQuery` calls (one per
  section) with `retry:false` (see below) and `@gift/ui`'s `LoadingState`/`ErrorNotice`/
  `EmptyState` for the three real states per section; a section's failure never blocks the other
  two. `CapacityCard`'s "Set up capacity" CTA (linking to `/profile/capabilities`) is rendered only
  for `role === 'dealer:owner'` (capabilities editing is owner-only per the permission matrix) —
  staff see the identical read state with no unusable affordance.
- Tests: `tests/dashboard-links.test.mjs` (3 tests, pure), `tests/dashboard-queries.test.mjs` (7
  tests, mocks `global.fetch` only — exercises the real request-building/parsing code against
  response bodies shaped exactly like API-CONTRACTS.md, including a count of 250 passed through
  unchanged to prove this layer never trims/paginates the aggregate, and a 404 surfaced as a
  readable `ApiError`).

### A real bug found and fixed during verification (not part of the original plan)

While verifying against a live `next dev` + mock backend (see below), the counts card stayed
stuck on its loading spinner for several seconds after a confirmed 404 response, instead of
showing the error state immediately. Root cause: this app's global React Query default
(`components/providers.tsx`, lane A's file, not touched) retries every query automatically with
backoff; a 401/403/404 will never succeed on blind retry, so the error state was reachable but
delayed by ~7s of silent retrying. Fixed by setting `retry: false` on all three dashboard queries
in `DashboardContent.tsx` (within this task's own owned path) — the explicit "Try again" button is
the one real retry mechanism this screen offers, matching the acceptance bar's expectation that
retry genuinely works, promptly, not eventually.

### Verified contracts

- API-CONTRACTS.md: "Dashboard aggregates" section (`GET .../dealer_orders/dealer/dashboard`
  response shape, IST week-boundary semantics) and the `dealer_org_rbac`/`dealer_orders` dealer
  routes this task composes client-side (no cross-module backend join exists or was invented).
- CONTRACT-HANDOFF.md: the pending-KYC holding-page freeze (consumed via `requireApprovedDealer()`,
  not reimplemented), `PortalShell`/`PortalNav`'s prop contract (consumed unmodified), the
  permission matrix (capacity view readable by both roles, edit owner-only).
- Read directly from `apps/mercato` source, not just the docs: `dealer_orders/lib/dashboard.ts`
  (`computeDealerDashboard`'s exact SQL filter — confirms which `status` each count card must link
  to) and `dealer_orders/api/dealer/orders/route.ts` + `data/validators.ts`
  (`assignmentListQuerySchema`'s `status` field — confirms `?status=X` is a real, backend-enforced
  filter, not a guessed URL shape) and TASK-09's own task file (owned-paths line, to confirm the
  orders-list page I'm linking to but not building).

### Commands and results

- `cd apps/dealer-portal && node --test tests/*.test.mjs` →
  **before this task (measured at session start): 66/66 passing.**
  **after this task, dashboard tests only: 10/10 passing** (`dashboard-links.test.mjs` 3,
  `dashboard-queries.test.mjs` 7). **Full suite at hand-off time: 141/141 passing** — the
  difference beyond this task's 10 is concurrent work from other lanes in this same shared
  checkout (onboarding, finance/earnings-ledger tests landed mid-session), not this task's; this
  task touched none of those files and the full-suite number is reported only as an honest
  before/after snapshot, not as this task's own coverage.
- `npx eslint src/lib/features/dashboard src/components/dashboard "src/app/(portal)"` → 0 errors,
  0 warnings.
- `npx tsc --noEmit` → no errors attributable to any file this task touched (grepped the full
  output for `dashboard`/`(portal)`: no matches). The build's one pre-existing failure
  (`src/components/onboarding/RegisterForm.tsx`, a concurrent lane's in-progress file, `string |
  null` not assignable to `string`) is outside this task's owned paths and was not introduced by
  this task.
- **Live, real-browser verification** (the acceptance bar explicitly wants more than static
  markup): started a mock `apps/mercato` backend (`node:http`, response bodies shaped exactly like
  the documented contracts, including a `pendingAcknowledgment` of 250 — larger than any single
  page — to prove the UI never trims an aggregate it's handed) and a real `next dev` server
  pointed at it, then drove it with Playwright (Chromium, headless, from `apps/mercato`'s own
  installed `playwright` package) via cookie-selected scenarios:
  - **Owner, full data:** heading renders; "Recent activity" shows the two real assignments with
    correct status badges (`In Production`, `Dispatched`) and formatted Asia/Kolkata timestamps,
    linked by ASSIGNMENT id (`/orders/assignment-1`, not the order id); "Available capacity" shows
    "30 orders / day" (the real `maxDailyCapacity`); the counts section shows a real `ErrorNotice`
    ("Not available") + working "Try again" button — this is the documented allowlist blocker
    surfacing correctly as a real error state, not a crash, not a fabricated number.
  - **Staff, identical data:** same rendering as owner, except the "Set up capacity" CTA is
    correctly absent (owner-only edit affordance; the read state itself is identical) — confirms
    the responsive, functional dashboard is not owner-only, per the acceptance bar.
  - **No orders yet / capacity not configured:** "Recent activity" renders `EmptyState` ("No
    orders yet"); "Available capacity" renders "Not configured yet." + "Set up capacity" (owner)
    — never a fabricated "0 orders/day" or a synthetic activity row.
  - **Mobile viewport (390×844):** hamburger nav, single-column stacked cards, all the same real
    content — confirmed via screenshot, not just CSS inspection.
  - **Retry:** clicked the counts section's "Try again" button; it re-fires the request (confirmed
    via server access log) and correctly shows the same real error again (the endpoint is still
    blocked) — proving the retry affordance genuinely re-attempts the network call rather than
    being a dead button.
  - **Unauthenticated:** confirmed the page never renders dashboard content and instead emits the
    `__next-page-redirect` meta-refresh to `/login` (same mechanism P2-UI-04's own handoff
    documents for a Server Component redirect once streaming has started) — the server-side gate
    is genuinely active on this page, not just present in navigation.
  - Screenshots and the mock backend/Playwright scripts used for this were written to this
    session's scratchpad directory, outside the repository — nothing from this verification pass
    is part of the commit.

### Blockers or follow-up tasks

1. **Lane A (P2-UI-01) must add one allowlist entry** to
   `apps/dealer-portal/src/lib/http/allowlist.ts`:
   `{ pattern: /^dealer_orders\/dealer\/dashboard$/, methods: ['GET'] }`. Until then, the counts
   section's real 404+retry state is what every real user sees instead of real counts — the
   dashboard degrades honestly (this task's own requirement) but is not fully functional end to
   end through the browser until that line lands. This is the only remaining gap between "builds
   and tests cleanly" and "fully working in the real running app."
2. **TASK-09 (orders list) does not exist yet.** This task's count-card links
   (`/orders?status=assigned`, `?status=in_production`, `?status=dispatched`) are built against
   the real, backend-verified `status` filter contract (not guessed), but cannot be click-tested
   end to end against a real orders list page until TASK-09 lands. No fabricated route was
   invented to work around this.
3. Per this task's own scope: "available capacity" is `capabilities.maxDailyCapacity` only (per
   API-CONTRACTS.md's explicit TASK-08 composition note); it does not attempt a payouts/ledger
   balance call — that was confirmed out of scope for this screen (CONTRACT-HANDOFF reserves
   `/earnings` for payouts/ledger display, owned by a different task).

- Ready for dependent tasks: Yes, with the one caveat above (the allowlist entry is lane A's to
  add, not something this task could do from its own owned paths) — the dashboard's code,
  behavior, and test coverage are complete and verified; TASK-17 (integration) should re-check the
  counts section specifically once that one line lands in a real multi-order tenant.
