# P2-UI-10: Dealer order detail and production status

- Status: Review
- Owner lane: C
- Depends on: P2-UI-01, P2-UI-02, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/orders/[id]/; src/components/orders/detail/; src/lib/features/orders/detail.ts

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Show order line requirements, gift message, quantity, deadline and permitted delivery city/pincode.
- [x] Implement detail and /status route with optional note and only allowed forward transitions from backend constants.
- [x] Refresh after successful mutation; handle cancelled, reassigned, stale, forbidden and missing assignments.
- [x] Do not add 3D proof review or full courier integration.

## Acceptance and verification

- [x] assigned -> acknowledged -> in_production -> ready_for_dispatch -> dispatched verified.
- [x] Invalid/backward and cross-dealer transitions rejected server-side.
- [x] Customer PII beyond agreed fulfillment data never appears.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Review

### What was built

- `apps/dealer-portal/src/app/(portal)/orders/[id]/page.tsx` — server component. Gates with
  `requireApprovedDealer({ returnTo: '/orders/${id}' })` (role-agnostic, same as `/orders` —
  `dealer_orders.dealer_access` is granted to both `dealer:owner` and `dealer:staff`), awaits the
  Next 16 `params` promise for `id`, mounts `PortalShell`. No `<Suspense>` needed here (unlike
  `/orders`): this page takes its identity from the route param, not `useSearchParams()`.
- `apps/dealer-portal/src/components/orders/detail/OrderDetailView.tsx` — client orchestrator.
  Fetches `GET .../dealer/orders/{assignmentId}` via `useQuery`. Renders four distinct
  non-happy-path states by name, per the acceptance criteria, rather than one generic error:
  `SessionExpired` (401), `PermissionDenied` (403), a dedicated "Order not found" state with a
  link back to `/orders` (404 — deliberately the same copy for a truly missing id and a
  cross-dealer guess/enumeration attempt, since the backend itself returns the identical 404 for
  both and this UI must never hint which case it was), and a generic `ErrorNotice` with retry for
  anything else. When the loaded assignment's own `status === 'cancelled'` (covers both an admin
  cancellation and a reassignment away from this dealer — the original assignment row persists for
  the original dealer, only its status changes), shows an explicit "cancelled or reassigned, no
  action needed" banner and never renders the status-update form in an actionable state.
- `apps/dealer-portal/src/components/orders/detail/OrderLineItems.tsx` — renders exactly the
  per-line fields FEAT-010 allows (name/variant, quantity, gift message, production requirements)
  by reading each field off the typed shape by name; never spreads/iterates the raw line object.
- `apps/dealer-portal/src/components/orders/detail/StatusUpdateForm.tsx` — the status-update
  action. Offers ONLY the single next forward transition `nextStatusFor` computes from the
  assignment's real current status (no free-form status picker exists, so this component cannot
  construct a request for a transition outside the real backend graph), plus an optional
  &lt;=500-char note. Always sends the `updatedAt` last read from the detail fetch (opts into the
  backend's optimistic-concurrency 409). On success, awaits the parent's `onUpdated` (which
  invalidates the detail query) rather than applying the new status to local state — "refresh from
  the server response, not an optimistic-only update" is structural here, not a convention someone
  has to remember. Surfaces four distinct mutation failures with different copy/recovery actions:
  409 (stale version — "refresh to see the latest status", with a refetch action), 400 (invalid
  transition — shows the real backend message verbatim, e.g. "Invalid status transition: dispatched
  → in_production"), 404 (assignment no longer resolves — "may have been cancelled or reassigned",
  with a refetch action), and 401/403 (defense-in-depth; the page-level query already handles these
  normally). A stale error banner clears itself once the parent's refetch lands a new
  `status`/`updatedAt` (a `useEffect` resets mutation state on those prop changes) rather than
  lingering after a successful recovery.
- `apps/dealer-portal/src/lib/features/orders/detail.ts` — the one file this task may add under
  `lib/features/orders/` (owned-paths names this exact file). `fetchOrderDetail`/`updateOrderStatus`
  (the two calls), `DEALER_STATUS_TRANSITIONS`/`nextStatusFor`/`isTerminalStatus` (mirrored verbatim
  from the real backend constants — see below), `classifyOrderDetailError` (401/403/404/409/400 ->
  named kinds), and display helpers (`formatProductionRequirements`, `orderReferenceLabel`).
  Deliberately does NOT import TASK-09's `list.ts` even though both describe the same detail
  response shape — each task owns its own file; the small type duplication keeps this task
  independently buildable against a concurrently-landing sibling, matching the repo's existing
  "redeclare, don't cross-import across an ownership boundary" convention.

### Real backend status-transition constants (read from source, not guessed)

Read `apps/mercato/src/modules/dealer_orders/lib/constants.ts` directly:

```ts
export const DEALER_STATUS_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  assigned: ['acknowledged'],
  acknowledged: ['in_production'],
  in_production: ['ready_for_dispatch'],
  ready_for_dispatch: ['dispatched'],
  dispatched: [],
  cancelled: [],
}
```

`detail.ts` mirrors this verbatim (comment cites the source file). `updateAssignmentStatusSchema`
(`data/validators.ts`) independently confirms the dealer can never submit `assigned`/`cancelled` as
a target status — this UI never offers either as a choice in the first place, since it only ever
shows the one `nextStatusFor(status)` result, never a picker.

### Safe projection — verified against the actual response, not assumed

Read `dealer_orders/commands/assignments.ts`'s `buildDealerOrderDetail` and
`dealer_orders/lib/orderDetails.ts`'s `loadDealerOrderDetail` directly (not just API-CONTRACTS.md's
description of them). The real response is exactly:

```
{ assignmentId, orderId, orderNumber, status, statusNote, statusUpdatedAt, requiredBy, assignedAt,
  updatedAt, lines: [{ id, productId, variantId, name, quantity, giftMessage,
  productionRequirements }], shipping: { city, pincode } }
```

No `dealerProfileId`/`tenantId`/`organizationId`/`assignedBy`/`cancelledReason`, and no customer
name/phone/full address/email anywhere in the payload or the raw SQL that builds it
(`loadDealerOrderDetail` selects only `order_number`, `shipping_address_snapshot` from
`sales_orders` and `id, product_id, product_variant_id, name, quantity, metadata, configuration,
comment` from `sales_order_lines` — no customer/billing columns are ever selected). Every component
this task built reads fields off the typed `DealerOrderDetail` shape by name; none spreads or
iterates the raw response object, so a backend field this task hasn't reviewed could never start
rendering silently even if one were added later.

### Verified contracts

- `GET /api/dealer_orders/dealer/orders/{assignmentId}` and
  `POST /api/dealer_orders/dealer/orders/{assignmentId}/status` — both already allow-listed in
  `src/lib/http/allowlist.ts` (lane A/TASK-09's file; not touched here — both entries already
  existed, confirmed by reading the file before writing any client code, so no allowlist edit was
  needed for this task).
- Dealer-ownership enforcement on both routes (`resolveOwnDealerProfileId`, scoped `em.findOne` by
  `tenantId` + `dealerProfileId`, never by `tenantId` alone) — confirmed by reading
  `api/dealer/orders/[id]/route.ts`, `api/dealer/orders/[id]/status/route.ts`, and
  `commands/assignments.ts`'s `executeUpdateStatus`, backed by `dealer_orders/__tests__/
  dealerScope.test.ts`'s fail-closed coverage (cross-org lookup never resolves).
- Optimistic concurrency (409 on stale `updatedAt`) — confirmed in `executeUpdateStatus` and backed
  by `dealer_orders/__tests__/statusUpdateConcurrency.test.ts` (asserts a stale `updatedAt` returns
  409 and `updateOrmEntity` is never called).
- Invalid-transition rejection (400) — confirmed in `executeUpdateStatus`'s
  `DEALER_STATUS_TRANSITIONS[assignment.status].includes(newStatus)` check.
- Cancelled-assignment write guard (400, `assignmentCancelled`) — confirmed in `executeUpdateStatus`,
  checked before the transition-table lookup.

### Commands and results

- `npm run typecheck` — clean (0 errors) after one fix: `nextStatusFor` needed
  `allowed[0] ?? null` instead of a length check, since `noUncheckedIndexedAccess` makes
  `array[0]` type as `T | undefined`.
- `npm run lint` — 0 errors; the same 2 pre-existing warnings as TASK-09's handoff recorded
  (`components/auth/LogoutButton.tsx`, `ResetPasswordForm.tsx` — files this task never touched).
- `npm run build` — succeeds; `/orders/[id]` registers as a dynamic (`ƒ`) route.
- `npm run test` (`node --test tests/*.test.mjs`) — baseline at the start of this task's session
  was **200/200** (matches TASK-09's own recorded end-of-session count). This task added 2 new
  test files: `tests/order-detail-data.test.mjs` (34 tests — the mirrored transition graph asserted
  equal to the real backend constants; `nextStatusFor`/`isTerminalStatus` walked across every
  status; a check that no transition in the mirrored graph is ever backward/sideways;
  `fetchOrderDetail`/`updateOrderStatus` request-shape assertions against real contract-shaped
  fixtures; **the full `assigned -> acknowledged -> in_production -> ready_for_dispatch ->
  dispatched` sequence driven end-to-end** against a mocked fetch that tracks state across calls
  and asserts each posted status is exactly `nextStatusFor` of the current one; `classifyOrderDetailError`
  mapped for 401/403/404/400/409 with the 400-vs-409 distinction asserted explicitly so the two
  can never collapse into one UI bucket; and `formatProductionRequirements`/`orderReferenceLabel`
  display-logic cases) and `tests/order-detail-isolation.test.mjs` (8 tests — static source scan
  mirroring `tests/orders-list-isolation.test.mjs`'s/`tests/finance-no-mutations.test.mjs`'s own
  pattern: no file in this task's owned surface references a customer-PII-shaped field name
  (`customerName`/`phone`/`email`/`*Address`/`customer`) or `dealerProfileId`, no file logs the raw
  detail object, no file reads a dealer id from route params/query string, and the data layer's
  only two request paths are exactly the documented assignment-id-keyed GET/POST routes). Full
  suite at the end of this task's session: **242/242** — 42 new, all passing; every pre-existing
  test still passes unchanged.

### Acceptance criteria — how each was verified

- **Full `assigned -> dispatched` sequence works end-to-end**: verified at the data-layer level
  against contract-shaped fixtures (see test above) — each step's posted status is checked against
  `nextStatusFor` of the just-fetched status, and the sequence terminates at `dispatched` with
  `nextStatusFor('dispatched') === null`. The actual HTTP request/response shapes
  (`fetchOrderDetail`/`updateOrderStatus`) are real, not re-implemented; only the server's
  responses are mocked, per this app's established test style (no jsdom/testing-library is
  installed in this app — every existing test file in `tests/` tests the `lib/features/*` data
  layer the same way, never full component rendering, so this task follows that same convention
  rather than introducing a new one).
- **Invalid/backward transition rejected, and surfaced clearly, not silently**: `StatusUpdateForm`
  only ever offers the single real forward transition, so a backward/invalid attempt can only reach
  the backend if the backend's own graph ever disagrees with the mirrored one — confirmed by a
  dedicated test asserting a 400 response's exact backend message (e.g. "Invalid status
  transition: dispatched → in_production") is read straight into the error banner text, not
  replaced with a generic message that would hide what happened. Backend-side rejection itself is
  verified by reading `executeUpdateStatus`'s transition-table check directly (not re-implemented
  here) — real backend enforcement, confirmed by source reading, not merely assumed.
- **Cross-dealer access attempt rejected**: verified by reading the actual route/command code
  (`resolveOwnDealerProfileId`, scoped `em.findOne` on both the GET detail and POST status routes)
  and the real backend test (`dealerScope.test.ts`) that exercises the fail-closed path — same
  depth of verification TASK-09's own handoff recorded for the list/detail routes it depends on.
  **Caveat, carried forward from TASK-09's own residual-gaps section**: this is verified by
  code-reading + the backend's own unit tests (which mock the `EntityManager`), not by a live
  two-real-dealer browser session against a running Postgres instance — that is an
  integration-level concern for TASK-17, not reproducible from this task's owned paths alone (no
  backend/DB was started as part of this task).
- **No customer PII beyond the agreed safe fields, anywhere, including error messages/logs**: the
  response shape itself was checked against the real SQL in `loadDealerOrderDetail` (see above,
  no customer/billing columns are ever selected server-side); every component reads named fields
  only (never spreads the raw response); the isolation test statically scans for PII-shaped field
  names and for any `console.*` call that logs the detail object. Error messages shown to the user
  are either this app's own fixed copy or the backend's `error` string, which — per
  API-CONTRACTS.md's standard response shapes and this task's own reading of the 400/404/409 throw
  sites in `executeUpdateStatus` — never includes a PII value (they're all either a fixed
  translated string or an id, never an order/customer field value).

### Blockers or follow-up tasks

1. Same caveat TASK-09 already recorded for its own list/detail dependency: true live-session,
   two-real-dealer cross-dealer verification against a running backend has not been done from this
   task (no backend/DB available in this session) — flagged for TASK-17, not a silent gap.
2. `statusNote` is overwritten, not appended, by the backend (confirmed in
   `executeUpdateStatus`) — this screen shows only the single latest note under "Latest note";
   there is no notes-history UI, by design, since the backend has nothing to back one with.
3. Out of scope, per the task file, and deliberately not built: no 3D proof review UI, no courier/
   shipping integration, no placeholders for either.
4. No allowlist change was needed — `src/lib/http/allowlist.ts` already had both routes this task
   needed (added by an earlier lane), confirmed by reading the file before writing any client code.

### Ready for dependent tasks

Yes. `/orders/[id]` is built, gated, tested, and uses only the verified, already-allow-listed
`dealer_orders` dealer detail/status contract — the real backend transition constants, not a
guessed graph. The one real caveat is the same one TASK-09 already carried forward: cross-dealer
isolation is verified by code-reading + the backend's own (EntityManager-mocked) unit tests, not by
a live two-dealer browser session, because no backend/DB was available in this session — named for
TASK-17, not silently assumed away.
