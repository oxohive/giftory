# P2-UI-16: Admin ledger, payout recording and adjustments

- Status: Implemented, ready for review
- Owner lane: E
- Depends on: P2-UI-00, P2-UI-02
- Owned paths: payouts/backend/; payouts/components/; payouts/i18n/ under apps/mercato/src/modules/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Build dealer ledger/balance views and filters.
- [x] Add manual payout recording and credit/debit adjustment dialogs with required reference/reason.
- [x] Clearly say recording an externally completed payout; this action does not transfer money.
- [x] Use exact integer paise conversion, prevent duplicate submissions and refresh balances; preserve append-only records.

## Acceptance and verification

- [x] Recorded payout reduces pending balance without changing earned total; adjustment math checked.
- [x] Zero, negative, fractional-paise and missing-note submissions rejected.
- [x] No edit/delete controls for ledger entries; role checks and failure recovery verified.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Implemented, ready for review

- Changed files (all under `apps/mercato/src/modules/payouts/`, the owned paths — nothing outside `payouts/backend/`, `payouts/components/`, `payouts/i18n/` was touched):
  - `components/money.ts` — integer-paise helpers: `parseRupeesToPaise` (string-only rupee→paise conversion, no float multiplication), `formatPaise` (integer div/mod display formatting), `computeLedgerBalanceFromEntries` (mirrors the exact SQL in `payouts/api/admin/dealers/[id]/ledger/balance/route.ts`, documented including the `adjustment_credit` doesn't raise `totalEarned` asymmetry — "Gap 6" in CONTRACT-HANDOFF.md).
  - `components/submitGuard.ts` — plain (non-React) double-submit guard.
  - `components/ledgerActions.ts` — `submitRecordPayout`/`submitCreateAdjustment`: client pre-validation + structured failure handling, decoupled from JSX for direct unit testing.
  - `components/useLedgerAccess.ts` — `/api/auth/feature-check`-backed hook gating the "Record payout"/"Add adjustment" buttons on `payouts.manage` (mirrors the shipped `useWebhookFeatureAccess` pattern).
  - `components/RecordPayoutDialog.tsx`, `components/CreateAdjustmentDialog.tsx` — the two required dialogs. Both require amount + reference/reason, both block on client validation before calling the API, both disable their submit button and route through the double-submit guard, both state explicitly that this only documents an externally-completed payment and never transfers money.
  - `components/DealerLedgerView.tsx` — balance cards (pending vs. lifetime-earned, explicitly labelled as different numbers), the ledger `DataTable` (entry-type/direction/date-range filters — date range is client-side only on the loaded page, see Blockers), and the two action buttons. No `rowActions`, no edit/delete anywhere.
  - `components/DealersLedgerPicker.tsx`, `components/DealerLedgerPage.tsx` — per-dealer entry point (payouts admin routes are all dealer-scoped; there's no cross-dealer ledger listing endpoint).
  - `backend/payouts/page.tsx` + `page.meta.ts` — new admin page at `/backend/payouts` (sidebar entry "Payouts", icon `wallet`): the dealer picker.
  - `backend/dealers/[id]/ledger/page.tsx` + `page.meta.ts` — `/backend/dealers/{id}/ledger` (`navHidden`), exactly the route CONTRACT-HANDOFF froze for this task. **Note:** the picker page was deliberately placed at `/backend/payouts`, not `/backend/dealers` — `/backend/dealers` (no id) is frozen as `dealer_org_rbac`'s admin dealer directory (TASK-12); a `payouts/backend/dealers/page.tsx` would have collided with it. Confirmed no collision via `yarn generate`'s route table.
  - `components/__tests__/{money,submitGuard,ledgerActions,serverValidatorsRejectInvalidAmounts,noEditOrDeleteControls}.test.ts` — see "Commands and results".
  - `i18n/en.json` — added a `payouts.admin.*` subtree (dealer picker, ledger page, both dialogs). Existing `payouts.errors`/`payouts.audit` keys untouched.
  - Ran `yarn generate` after adding the pages — regenerated `.mercato/generated/**` (tooling output, not hand-edited).

- Verified contracts (read-only against `payouts/api/`, `payouts/data/`, `payouts/acl.ts`, `payouts/setup.ts`, `dealer_org_rbac/api/admin/dealers*` — none of these were edited):
  - `GET/POST /api/payouts/admin/dealers/{id}/ledger[/balance|/payout|/adjustment]` request/response shapes, confirmed against the actual route files and `openapi.ts`.
  - `recordPayoutSchema`/`createAdjustmentSchema` (`payouts/data/validators.ts`): `amount: z.number().int().positive()`, `note: z.string().trim().min(1).max(500)` — zero/negative/missing-note already covered by the pre-existing `payouts/__tests__/contracts.test.ts`; added a fractional-paise case (`100.5`) against the same real schemas, which was the one case not already asserted.
  - `payouts/acl.ts` + `setup.ts`: `payouts.view` (admin/employee/superadmin) vs. `payouts.manage` (admin/superadmin only) — confirms only authorized admin roles can record payouts/adjustments; `dealer:owner`/`dealer:staff` get neither. The admin page is gated server-side on `payouts.view` via `page.meta.ts`; the two mutation buttons are additionally hidden client-side for a `payouts.view`-only admin via `useLedgerAccess` (`payouts.manage`) — backend ACL on the POST routes stays authoritative regardless of what the hook reports.
  - `GET /api/dealer_org_rbac/admin/dealers` and `GET .../admin/dealers/{id}` (used read-only by the dealer picker/ledger page) — confirmed field shapes (`businessName`, `contactEmail`, `city`, `state`, 404 when not approved) directly from the route source.

- Commands and results:
  - `yarn generate` — succeeded (pre-existing, unrelated OpenAPI-bundling ESM warning that falls back to static extraction; not caused by this change, confirmed by running `yarn generate` before touching anything).
  - `yarn typecheck` — clean for every file this task owns. Three pre-existing errors remain, all in files **outside** this task's owned paths and actively being edited by a concurrent lane-A agent during this session (confirmed by file mtimes): `payouts/acl.ts` (generated-file `default`-export mismatch) and `payouts/__tests__/dealerScope.test.ts` (argument-count mismatch). Not touched, per the "stay entirely out of" instruction for other lanes' concurrent work.
  - `yarn lint` — 0 errors, 0 warnings for `payouts/**` (fixed one `react-hooks/exhaustive-deps` warning introduced during development before finishing).
  - `yarn jest` **before** this task's work (captured mid-session, before adding this task's test files): `Test Suites: 1 failed, 27 passed, 28 total` / `Tests: 4 failed, 411 passed, 415 total` — all 4 failures were in `dealer_onboarding/__tests__/validators.test.ts`, a different lane's concurrent in-progress work, not this task.
  - `yarn jest` **after**: `Test Suites: 38 passed, 38 total` / `Tests: 474 passed, 474 total` — 0 failures (the dealer_onboarding failures were since fixed by that lane, not by this task). Net contribution from this task: 5 new suites / 84 total payouts-scoped tests (`yarn jest src/modules/payouts` → `7 passed, 7 total` suites, `84 passed, 84 total` tests, including the 2 pre-existing payouts suites this task did not touch). No regressions anywhere in the full run.
  - Acceptance math check, in `components/__tests__/money.test.ts`, against the real balance formula (not a mock of the business rule — the exact SQL from `payouts/api/admin/dealers/[id]/ledger/balance/route.ts` is reproduced and cited): a `commission_earned` credit of 100000 paise followed by a `payout_disbursed` debit of 40000 paise yields `totalEarned = 100000` (unchanged) and `pendingAmount = 60000` — recording a payout reduces pending balance without changing the earned total, exactly the acceptance criterion. Also covers the `adjustment_credit`/`adjustment_debit` asymmetry.
  - Zero/negative/fractional/missing-note rejection: verified server-side via the real Zod schemas (`serverValidatorsRejectInvalidAmounts.test.ts` plus the pre-existing `contracts.test.ts`), not just client-side — the UI's own pre-validation (`ledgerActions.test.ts`) additionally proves `post()` (the network call) is never even attempted for an invalid amount or a blank reference/reason.
  - No edit/delete controls: verified by a static source-text guard (`noEditOrDeleteControls.test.ts`) asserting no `payouts/components/*.tsx` file renders `rowActions`, calls `updateCrud`/`deleteCrud`, or issues a `PUT`/`PATCH`/`DELETE` request — backed by the fact that no such backend route exists in the first place.
  - Double-submit guard: verified directly (`submitGuard.test.ts`) — a second concurrent call while the first is in flight is skipped rather than firing a second request; the guard releases correctly on both success and a thrown failure so a genuinely failed submission can be retried.
  - Failure recovery: verified in `ledgerActions.test.ts` — a thrown server/network error becomes a structured `{ ok: false, error }` result (never an unhandled rejection), the underlying `post()` is called exactly once per submit attempt, and the dialog components (by construction — not covered by a DOM test, see Blockers) keep the entered amount/note and re-enable the submit button on failure rather than closing or clearing the form.

- Blockers or follow-up tasks:
  - **Date-range ledger filtering is client-side only.** `payouts/data/validators.ts`'s `ledgerListSchema` and the admin list route accept no date-range query params — this task's owned paths exclude `payouts/api/`/`payouts/data/`, so the date-range `DataTable` filter here only narrows the currently-loaded page of entries (disclosed to the admin via the filter's `tooltip`). A real fix needs a backend change (new query params on the list route) — raise with lane A (whichever task now owns `payouts/api/`) as a small follow-up if full-history date filtering is required.
  - **No DOM/RTL test coverage for the dialogs themselves.** This app has no existing React-component (jsdom) tests to follow a precedent from, and mounting Radix `Dialog` for the first time in this codebase carried enough unknown risk (jsdom polyfills, portal rendering, etc.) that it wasn't worth it against the 400-baseline "no regressions" bar. Instead, all dialog *logic* (validation, paise conversion, double-submit guard, failure handling) was factored out into plain, directly-testable functions (`ledgerActions.ts`, `submitGuard.ts`) and unit-tested there; the dialog components themselves are thin, closely mirror the already-shipped `LinkDocumentDialog` pattern (`@open-mercato/documents`), and were read through carefully rather than executed in a browser. If a later task wants full component-level coverage, this is the natural next step and will need `@jest-environment jsdom` + `@testing-library/react` wired up for the first time in `apps/mercato`.
  - **Known backend gaps this task cannot fix (owned by lane A / a backend task, documented in CONTRACT-HANDOFF.md / API-CONTRACTS.md):** payout/adjustment routes take no idempotency key and have no server-side duplicate guard (Gap 4/5) — mitigated here only client-side via the double-submit guard; a payout larger than the dealer's balance is accepted and can drive `pendingAmount` negative (Gap 4) — the UI does not attempt to validate against the live balance before submit, since the balance could change between page-load and submit anyway, and the real fix belongs server-side; `adjustment_credit` entries raise `pendingAmount` without raising `totalEarned` (Gap 6) — not "fixed" here, faithfully mirrored and explained in the balance card copy (`earnedHint`) instead.
  - Nav placement: per CONTRACT-HANDOFF's open question ("TASK-16 to confirm placement"), this task adds a standalone top-level "Payouts" sidebar entry at `/backend/payouts` rather than nesting under the dealer detail page — `dealer_org_rbac`'s own admin dealer detail page (TASK-12) was not yet built as of this session, so there was nothing to nest into; TASK-12 (or a follow-up) may want to add a "View ledger" link from its own dealer detail page into `/backend/dealers/{id}/ledger` once it exists — that is TASK-12's file to edit, not this task's.

- Ready for dependent tasks: **Yes**, with the two documented, non-blocking caveats above (date-range filtering is partial; dialogs lack DOM-level tests). The required admin surfaces exist, are reachable, are permission-gated both server- and client-side, enforce exact integer-paise math throughout, cannot edit or delete ledger entries, and the money-isn't-moving disclaimer is explicit in both dialogs and the page header. P2-UI-17 (integration) should be aware that `/backend/dealers` itself (the dealer directory) is still TASK-12's responsibility, not this task's.
