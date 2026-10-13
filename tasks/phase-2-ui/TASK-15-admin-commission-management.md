# P2-UI-15: Admin commission management

- Status: Review; implementation complete, pending coordinator verification
- Owner lane: E
- Depends on: P2-UI-00, P2-UI-02
- Owned paths: commissions/backend/; commissions/components/; commissions/widgets/; commissions/i18n/ under apps/mercato/src/modules/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Create rules list, create and deactivate flows for platform, dealer and product-type rules.
- [x] Explain effective dates, priority and basis-point conversion; use actual supported bounds.
- [x] Add read-only order commission snapshot tab and dealer commission history.
- [x] Keep snapshot immutable and historical rate intact after rule changes.

## Acceptance and verification

- [x] Rule precedence and correct INR amount displayed on a newly assigned order.
- [x] Rule deactivation does not rewrite existing snapshots.
- [x] Permission, validation, empty and failure states checked.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Complete — ready for coordinator review

- Changed files (28 new, 1 modified; all within this task's owned paths):
  - `commissions/i18n/en.json` (modified — added ~95 keys under `commissions.admin.*`)
  - `commissions/backend/commission-rules/page.tsx` + `page.meta.ts` — rules list (`/backend/commission-rules`)
  - `commissions/backend/commission-rules/create/page.tsx` + `page.meta.ts` — create form (`/backend/commission-rules/create`)
  - `commissions/backend/commission-rules/dealers/page.tsx` + `page.meta.ts` — dealer picker for commission history (`/backend/commission-rules/dealers`)
  - `commissions/backend/dealers/[id]/commission/page.tsx` + `page.meta.ts` — per-dealer commission history (`/backend/dealers/{id}/commission`; sibling leaf to `payouts`' existing `/backend/dealers/{id}/ledger` — no route collision, confirmed via `yarn generate`'s output)
  - `commissions/components/CommissionRulesTable.tsx` — list, filters (dealer/product type/show-deactivated), create action, deactivate row action, "view dealer history" row action
  - `commissions/components/CommissionRuleCreateForm.tsx` — `CrudForm` create-only (rules are append-only; no edit/delete route exists, only soft-deactivate)
  - `commissions/components/RuleScopePreview.tsx` — live bps→%/₹ conversion + existing-rule overlap panel, rendered inside the create form via a bare `CrudFormGroup.component`
  - `commissions/components/ruleFormSchema.ts` — client validation schema built by extending the REAL `commissionRuleCreateSchema` (imported from `data/validators.ts`, not duplicated) with empty-string tolerance + one client-only "unreachable scope" guard
  - `commissions/components/ruleScope.ts` — pure priority-tier classifier/picker mirroring `rateResolver.ts`'s documented 3-step waterfall, used for the overlap panel and table tier badges
  - `commissions/components/money.ts` — `formatPaise`/`formatBps` + `previewCommissionAmount`, which calls the REAL `computeCommissionAmount` from `lib/rateResolver.ts` (type-only `EntityManager` import there means it's safe in a client bundle)
  - `commissions/components/rulesQuery.ts` — single place encoding the `activeOnly` query-param footgun (empty string, never the literal `"false"`)
  - `commissions/components/dealerLookup.ts` — dealer picker/name-resolution hooks against `dealer_org_rbac`'s admin dealers API (read-only HTTP, no cross-module import)
  - `commissions/components/useCommissionAccess.ts` — client-side `commissions.view`/`commissions.manage` feature check (UX-only; server ACL on the routes is authoritative)
  - `commissions/components/DealerCommissionHistoryPicker.tsx`, `DealerCommissionHistoryPage.tsx`, `DealerCommissionHistoryView.tsx` — dealer picker + per-dealer immutable snapshot history
  - `commissions/components/__tests__/{money,ruleScope,ruleFormSchema,rulesQuery,realAssignmentPrecedence,snapshotsAreReadOnlyInTheUi}.test.ts` — see "Commands and results" below
  - `commissions/widgets/injection-table.ts` + `widgets/injection/order-commission-tab/widget.ts` + `widget.client.tsx` — read-only "Commission" tab injected into the core `sales` module's order detail page at the confirmed-live spot id `sales.document.detail.order:tabs`

- Verified contracts (against API-CONTRACTS.md / CONTRACT-HANDOFF.md, both "Verified working" for this task's admin routes):
  - `GET/POST /api/commissions/admin/commission/rules`, `GET/DELETE /api/commissions/admin/commission/rules/{id}`, `GET /api/commissions/admin/orders/{id}/commission`, `GET /api/commissions/admin/dealers/{dealerId}/commission` — all consumed exactly as documented, no guessed shapes.
  - `activeOnly` boolean-coercion bug — the "show deactivated rules" checkbox sends `activeOnly=''` (empty string), never `activeOnly=false`; locked in by `rulesQuery.ts` + its test.
  - Rules are append-only (no `updatedAt`, no edit route) — `CommissionRuleCreateForm` is create-only, with `disableOptimisticLock`; deactivation is a `DELETE` row action, not a `CrudForm` delete flow (confirmed `deleteCrud`'s `?id=` query-param shape doesn't match this route's path-param shape, so a direct `apiCall` DELETE + `useGuardedMutation` is used instead).
  - No server-side overlap guard on rule creation — the create form's preview panel queries existing rules for the exact same (dealer, productType) scope and shows which one currently wins, per API-CONTRACTS.md's explicit note for this task.
  - Dealer lookups (`dealer_org_rbac/admin/dealers[/...]`) consumed read-only via HTTP, mirroring the exact pattern `payouts/components/DealersLedgerPicker.tsx` and `DealerLedgerPage.tsx` already use for the identical need — no cross-module import, no edits to `dealer_org_rbac`.
  - Order-detail tab injection spot `sales.document.detail.order:tabs` confirmed live (not guessed) via two existing real injectors: core's own "History" tab and `example`'s `sales-todos` demo widget.
  - Sidebar placement uses `page.meta.ts` (`pageGroup: 'Dealers'`, matching `payouts`' existing group), not a `menu:sidebar:main` injection widget — per `.ai/guides/backend-ui.md`'s "prefer page metadata for app-owned destinations" and the live precedent both `gift_catalog` and `payouts` already use for their own pages in this exact repo.

- Commands and results:
  - `yarn generate` — succeeded; `commission-rules` and `dealers/[id]/commission` route shards generated, `commissions.injection.order-commission-tab` registered against `sales.document.detail.order:tabs` in `injection-widgets.generated.ts`. (Pre-existing, unrelated OpenAPI-bundling ESM warning on this Node version — falls back to static extraction; not caused by this task and not in its owned paths.)
  - `yarn typecheck` — zero errors in any file under this task's owned paths, confirmed by diffing before/after. (Repo-wide, the command still exits non-zero from ~160 pre-existing errors in `dealer_onboarding`/`dealer_orders`/`dealer_org_rbac`/`payouts` — all outside this task's owned paths and outside this task's authority to fix; not introduced by this task.)
  - `npx eslint` scoped to `commissions/backend|components|widgets/**` — 0 errors, 0 warnings.
  - `yarn i18n:check-hardcoded` — 0 findings in this task's owned paths.
  - `yarn ds:check` — 0 real findings in this task's owned paths. It flags `<Alert status="information" style="lighter">` as an "inline-style" false positive (the `style` prop here is `Alert`'s own semantic enum prop, not a CSS style object) — the same false positive already exists, unaddressed, in `payouts`' own committed components (`DealerLedgerView.tsx`, `DealersLedgerPicker.tsx`, etc.), confirming this is a known linter limitation, not a real violation introduced here.
  - `yarn jest` — before this task's changes (this task's own measured baseline, captured before any test file was added): **41 suites / 481 tests, all passing**. After: **52 suites / 549 tests, all passing — zero regressions**. (The task pack's originally documented P2-UI-02-era baseline was 400/400 across 26 suites; the gap reflects substantial concurrent work landed by other lanes in this shared checkout between that baseline and this run — not something this task caused or needs to reconcile.)
  - **Live-database, non-mocked verification** (the acceptance criterion's explicit "test this against a real assignment, not a mock"): ran a self-contained, transactional script against the project's real dev Postgres (the same `DATABASE_URL` `apps/mercato` uses), executing the **verbatim SQL** from `rateResolver.ts`'s `findRule` and the **real** `computeCommissionAmount` formula against freshly-inserted rows in the real (empty) `commission_rules`/`order_commission_snapshots` tables, scoped to a synthetic tenant/dealer id that matches no seed data:
    1. Seeded platform (200 bps), dealer-default (500 bps), and dealer+product-type (800 bps) rules for one dealer.
    2. Resolved a new assignment: the dealer+product-type rule won, rate 800 bps, **commission = 68,000 paise = ₹680.00** on an ₹8,500.00 order subtotal — computed by the real formula, not re-implemented.
    3. Froze that as a real snapshot row.
    4. Deactivated the winning rule (`UPDATE ... SET effective_to = ...`, exactly what the real command does).
    5. Resolved a second, later assignment: precedence correctly fell through to the dealer-default rule (500 bps) — the rule change took effect prospectively.
    6. Re-read the first snapshot: **byte-identical** to step 3 (same rate, same amount, same rule id) — deactivation did not rewrite it.
    7. Deleted every synthetic row inserted; table counts after exactly matched the counts before (0/0 both times); the whole run was one transaction, committed only after every assertion passed.
    The script lived outside the repo (scratchpad) and left no trace in the repository or the shared dev database — it is not part of this task's delivered file set, by design (a one-off verification run, not a maintained test; the repeatable-forever equivalent is `__tests__/realAssignmentPrecedence.test.ts`, which exercises the same precedence/amount math through Jest using the real `computeCommissionAmount` function, since a live-DB round trip cannot run inside this repo's `testEnvironment: 'node'` unit-test harness).

- Blockers or follow-up tasks:
  - None blocking this task's own scope. Noted for TASK-17 (integration): the full HTTP round trip (real admin session → `POST` a rule → trigger a real `dealer_order.assigned` event through `dealer_orders`' assignment flow → `GET` the resulting snapshot through this UI → deactivate → re-`GET`) has not been run end-to-end through the browser, since `dealer_orders`' admin assignment UI (TASK-13, a different lane, concurrent) is this task's only remaining external dependency for a full click-through demo. The commissions-side math, precedence, and immutability are independently verified above (both against real backend functions/SQL and via this task's own Jest suite); only the cross-module trigger path (an actual dealer-order assignment) remains for a browser-level demonstration.
  - `yarn ds:check`'s `Alert style="lighter"` false positive (see above) is pre-existing across this repo and not something this task should work around by deviating from the `Alert` primitive's documented API; flagging for whichever task/agent eventually tunes that linter rule.
  - This task did not touch `dealer_onboarding`, `dealer_org_rbac`, `dealer_orders`, or `payouts` files at all — confirmed via `git status` scoping before and after. The ~160 pre-existing `yarn typecheck` errors across those modules are concurrent work-in-progress from other lanes, not introduced or fixable from within this task's owned paths.

- Ready for dependent tasks: **Yes.** TASK-17 (integration/accessibility/regression) can build on this — `commissions` admin routes were already "Verified working" per CONTRACT-HANDOFF.md before this task started, and this task adds no new backend contract, so there is nothing for TASK-17 to be blocked on from this module beyond the cross-module click-through noted above.
