# P2-UI-13: Admin order assignment UI

- Status: Planned; implementation not started
- Owner lane: D
- Depends on: P2-UI-00, P2-UI-02, P2-UI-03
- Owned paths: dealer_orders/backend/; dealer_orders/components/; dealer_orders/widgets/; dealer_orders/i18n/ under apps/mercato/src/modules/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Extend installed sales order detail using verified injection slot (candidate sales.document.detail.order:tabs); do not modify framework source.
- [x] Show current assignment and assign/reassign/cancel with approved dealer picker, production deadline and reason.
- [x] Generate stable idempotency keys per user operation/retry; distinguish a deliberate new operation from a retry.
- [x] Respect paid-order and status constraints. Do not invent assignment history from current-only endpoint.
- [x] Coordinate separate commission tab ownership with lane E.

## Acceptance and verification

- [x] Paid order can be assigned and appears in dealer portal; unpaid assignment rejected. (Verified against the real, already-shipped contract: `commands/assignments.ts`'s `assertOrderIsPaid`/`findActiveAssignment` and `GET /api/dealer_orders/dealer/orders/{assignmentId}` are unmodified; this tab calls the same admin assignment routes TASK-10's dealer-portal order view already reads from. Not re-verified end-to-end against a live Postgres/dealer-portal session in this task — see Blockers below.)
- [x] Retry/double-click creates no duplicate; reassign/cancel refresh correctly. (Unit-verified: `components/__tests__/idempotencyKeys.test.ts` proves repeated `getOrCreateIdempotencyKey` calls for the same operation return the identical key, and a fresh key is minted only after `releaseIdempotencyKey`. `AssignDialog`/`CancelAssignmentDialog` wire this into the actual request headers and call `refreshAssignment()` — React Query `invalidateQueries` — on every success.)
- [x] Original sales order UI still works, with permission and conflict states tested. (Mirrors `commissions/widgets/injection-table.ts`'s proven-live precedent for the same `sales.document.detail.order:tabs` spot — no core/framework file touched; `yarn generate` confirms both modules' widgets register independently with no collision. Permission gating via `useBackendChrome()`/`hasFeature(..., 'dealer_orders.manage')` hides write actions for `dealer_orders.view`-only callers; a 403 from any action still surfaces `AccessDeniedMessage`. Conflict (409 already-assigned) and not-found (404 no-active-assignment-to-reassign/cancel) both close the dialog, flash the real server message, and refetch.)
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions. (26 new tests in `components/__tests__/assignmentActions.test.ts` + `idempotencyKeys.test.ts`, asserting against the real status/code shapes documented in API-CONTRACTS.md — e.g. a 400 from assign/reassign is classified `order_not_paid` because `assertOrderIsPaid` is the only `badRequest` either command throws; a 409 on assign and a 404 on reassign are classified distinctly, matching the real "assign has a conflict path, reassign does not" asymmetry.)
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Done (implementation + unit verification); live end-to-end browser verification not performed — see Blockers
- Changed files:
  - `dealer_orders/widgets/injection-table.ts` (new) — registers the tab at `sales.document.detail.order:tabs`, priority -4 (ahead of commissions' -5)
  - `dealer_orders/widgets/injection/order-assignment-tab/widget.ts` (new), `widget.client.tsx` (new) — the tab itself: current assignment, assign/reassign/cancel actions, collapsible history
  - `dealer_orders/components/AssignDialog.tsx` (new) — shared assign/reassign dialog
  - `dealer_orders/components/CancelAssignmentDialog.tsx` (new) — cancel dialog
  - `dealer_orders/components/DealerPicker.tsx` (new) — approved-dealer select with a non-enforced capability hint
  - `dealer_orders/components/assignmentActions.ts` (new) — pure submit/classify functions (mirrors `dealer_onboarding/components/reviewActions.ts`)
  - `dealer_orders/components/idempotencyKeys.ts` (new) — client-side per-operation `Idempotency-Key` mint/reuse/release
  - `dealer_orders/components/__tests__/assignmentActions.test.ts` (new, 20 tests), `idempotencyKeys.test.ts` (new, 6 tests)
  - `dealer_orders/i18n/en.json` (modified) — added `dealer_orders.admin.*` keys (orderTab, dealerPicker, assignDialog, cancelDialog)
- Verified contracts: admin assignment routes (`GET`/`POST`/`PUT`/`DELETE /api/dealer_orders/admin/orders/{id}/assignment`), the new history route (`GET .../admin/orders/{id}/assignments`), and `GET /api/dealer_org_rbac/admin/dealers` (read-only; not in owned paths, called but not modified) — all read directly from the route files per API-CONTRACTS.md/CONTRACT-HANDOFF.md, not guessed. Confirmed the real error shapes (`{"error","code":"request_failed"}` 400/404/409; `{"error","requiredFeatures"}` 403) and the real paid-order/conflict/idempotency-key-required cases from `dealer_orders/commands/assignments.ts` and `lib/http.ts` (read-only — both outside owned paths).
- Commands and results:
  - `yarn generate` — succeeded; `injection-tables.generated.ts`/`injection-widgets.generated.ts` confirm `dealer_orders.injection.order-assignment-tab` registers independently alongside `commissions`' existing tab widget on the same spot, no collision.
  - `yarn typecheck` — no errors in any owned path (`dealer_orders/components/`, `dealer_orders/widgets/`). Pre-existing, unrelated typecheck errors exist in `dealer_org_rbac/` and `dealer_orders/__tests__/` (neither owned by this task) — confirmed unrelated to this change and not introduced by it.
  - `yarn lint` — clean for owned paths (one `react-hooks/exhaustive-deps` warning was found and fixed during this task, not left outstanding).
  - `yarn jest` — baseline (before this task's changes, fresh run this session): **62 suites / 617 tests, all passing**. After this task's changes: **64 suites / 643 tests, all passing** (+2 suites / +26 tests, exactly this task's new test files; zero regressions elsewhere).
- Blockers or follow-up tasks:
  - **Live end-to-end verification not performed in this session.** This repo's dev database is a live, shared remote Supabase instance (not an ephemeral/local one), and two other agents (P2-UI-04, P2-UI-12) were concurrently active against this same checkout/DB while this task ran. Creating/mutating real order/dealer/assignment rows against that shared instance to manually prove "paid order → assign → visible from dealer portal" risked cross-contaminating concurrent work, so it was deliberately not attempted. What WAS verified: every status/error code this UI reacts to is read directly from the real, already-shipped route/command source (not guessed), and the client-side logic (idempotency reuse, error classification, success/stale-state/forbidden branching) is unit-tested against those real shapes. P2-UI-17 (integration) is the right place to close this gap, ideally via `yarn test:integration:ephemeral` (an isolated environment, per `apps/mercato/AGENTS.md`) rather than the shared dev DB.
  - **Assignment history exists but is a simple list, not a rich timeline.** `GET .../admin/orders/{id}/assignments` (TASK-03) is used as-is; the tab shows it as a collapsed, newest-first list (dealer, status, assigned/due dates, cancellation reason when present). No fabricated timeline/audit-trail beyond what that endpoint actually returns.
  - **Eligible-dealer filtering is informational only, not enforced** — per CONTRACT-HANDOFF.md's explicit resolution of that open question, the backend applies zero server-side eligibility check and the injected tab's own `context.record` (the core sales `DocumentRecord` type) carries no order line items to cross-reference against dealer capabilities. `DealerPicker` shows every approved dealer's `productTypeCodes`/`serviceableStates`/`maxDailyCapacity` as a hint under the selected dealer, exactly as the contract doc anticipates, and never removes a dealer from the list or blocks a selection.
  - **Dealer directory fetch is a single page of up to 100** (`GET /api/dealer_org_rbac/admin/dealers?pageSize=100`, no further pagination). Reasonable for this task pack's realistic tenant sizes; a tenant with more than 100 approved dealers would need a paginated/searchable picker, which was not built here as a deliberate scope cut given the admin-dealer-directory endpoint's own default page size.
- Ready for dependent tasks: Yes, with the live-verification gap above explicitly flagged for P2-UI-17 to close before final sign-off — the client-side implementation, its contracts, and its automated test coverage are complete and correct against the real backend as shipped.
