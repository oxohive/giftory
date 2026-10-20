# P2-UI-14: Dealer earnings and ledger screens

- Status: Review
- Owner lane: E
- Depends on: P2-UI-00, P2-UI-01, P2-UI-02, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/earnings/; src/app/(portal)/ledger/; src/components/finance/; src/lib/features/finance/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Show paginated earnings, commission details, ledger transactions, total earned and pending balance.
- [x] Follow task 00's explicit owner/staff read permission decision.
- [x] Convert integer INR paise for display only; format rates from basis points and keep immutable snapshots read-only.
- [x] Use exact endpoint filters and show credits/debits clearly.

## Acceptance and verification

- [x] Displayed balances match backend after commission, manual payout and adjustment — see handoff caveat: verified that this UI never recomputes the balance (passes the backend's own aggregate straight through `formatMoney`, with boundary-value tests proving lossless formatting), and that the shared balance formula itself is already covered end-to-end by `apps/mercato`'s existing test suite with exactly this scenario; no live Postgres+mercato dev server was booted from this task to independently re-run it over real HTTP, since that app is outside this task's owned paths.
- [x] Pagination and zero balances work; no floating-point monetary drift.
- [x] Other dealers' balances/details and write actions are inaccessible.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Review
- Changed files:
  - `apps/dealer-portal/src/app/(portal)/earnings/page.tsx` — owner-only server page (`requireRole(['dealer:owner'])`), renders `EarningsView` inside `PortalShell`.
  - `apps/dealer-portal/src/app/(portal)/ledger/page.tsx` — same gate, renders `LedgerView`.
  - `apps/dealer-portal/src/components/finance/{EarningsView,LedgerView,BalanceSummaryCards,EarningsTable,LedgerTable,LedgerFilters}.tsx` — read-only presentation; no edit/delete affordance anywhere, no `<form>`, no mutating request.
  - `apps/dealer-portal/src/lib/features/finance/{api,query,display}.ts` — fetchers over the BFF proxy, pure query-builders, pure formatting helpers.
  - `apps/dealer-portal/tests/finance-{query,display,no-mutations,isolation}.test.mjs` — 33 new `node --test` cases.
- Verified contracts (read directly from source, not guessed):
  - `GET /api/commissions/dealer/earnings` and `GET /api/payouts/dealer/ledger{,/balance}` — `commissions/api/dealer/earnings/route.ts`, `payouts/api/dealer/ledger/route.ts`, `payouts/api/dealer/ledger/balance/route.ts`. All three call `resolveOwnDealerProfileId(em, scope.organizationId, scope.tenantId)` — `dealerProfileId` is derived from session and a caller-supplied one is never read; the balance route no longer even accepts it as a query param. 404s (`profile_not_found`-shaped) if the caller's org has no *approved* profile.
  - Response shapes match API-CONTRACTS.md exactly: `{items,total,page,pageSize}` for both lists; `{pendingAmount,totalEarned,currencyCode,dealerProfileId}` for balance; snapshot fields `subtotalAmount/commissionRateBps/commissionAmount/ruleId` (paise, bps); ledger fields `amount/direction/entryType/note` (paise).
  - `commissionSnapshotListSchema`/`ledgerListSchema` (`commissions/data/validators.ts`, `payouts/data/validators.ts`) — confirmed the only filters the UI uses (`page`,`pageSize` for earnings; `+entryType`,`direction` for ledger) are real, accepted params; no filter UI was built for anything the backend doesn't accept (no date-range filter — the ledger route has none).
  - Task 00's "owner vs staff earnings access" resolution (API-CONTRACTS.md's resolved-questions table + CONTRACT-HANDOFF.md's permission matrix): `commissions.dealer_access`/`payouts.dealer_access` go to `dealer:owner` only, **not** `dealer:staff`, by design (FEAT-009). Both pages call `requireRole(['dealer:owner'], {...})` (P2-UI-04's `src/lib/auth/guard.ts`, consumed read-only, not edited) — a staff caller is redirected server-side to the existing `/forbidden` page (P2-UI-04's, also not edited), which already states "This section is only available to the business owner account." Both `EarningsView`/`LedgerView` additionally handle a defensive 403 client-side (`ApiError.isForbidden`) with the same explanation, in case a session change ever raced the redirect — never a blank page or a raw error.
  - Money/rates convention (API-CONTRACTS.md "Money"/"Rates", CONTRACT-HANDOFF's "Money helper warning"): every amount from these two modules is already integer paise — `formatMoney` is called directly, never through `toMinorUnits`. `commissionRateBps` is formatted via `formatBps` (e.g. 800 → "8%"); a snapshot recorded with `ruleId: null` and `commissionRateBps: 0` (the rate-resolver's no-match fallback) renders as the explicit "No active rule", distinct from a genuine 0%-rule snapshot.
  - Running-balance decision (API-CONTRACTS.md, explicitly descoped): shipped as recommended — the aggregate `{pendingAmount,totalEarned}` prominently via `BalanceSummaryCards`, and the ledger list as a plain chronological log with no per-row running-balance column.
- Commands and results:
  - `cd apps/dealer-portal && npm test` — **before this task's changes: 66/66 passing** (clean baseline, no other finance/dashboard/onboarding test files existed yet). **After: 109/109 passing** — my own 33 new tests (`finance-query`/`finance-display`/`finance-no-mutations`/`finance-isolation`) all pass; the remaining growth (66→109, minus my 33 = 10 tests) and the two transient failures I observed mid-session (`dashboard-links.test.mjs`, `dashboard-queries.test.mjs` — a concurrent lane's in-progress `src/lib/features/dashboard/` files) came from other agents working the same checkout concurrently (dashboard/onboarding lanes); both had resolved to passing by the time of my final full-suite run. Zero regressions introduced in my own paths at any point.
  - `npx tsc --noEmit` (whole app) — clean on my files throughout. One transient error surfaced mid-session in `src/components/onboarding/RegisterForm.tsx` (a concurrent agent's file, outside this task's owned paths, mid-edit) — not touched, not mine to fix, and outside `earnings/`, `ledger/`, `components/finance/`, `lib/features/finance/`.
  - `npx eslint "src/app/(portal)/earnings" "src/app/(portal)/ledger" src/components/finance src/lib/features/finance` — 0 errors, 0 warnings (an initial `window.location.assign('/login')` warning in two files was resolved by switching to `useRouter().push('/login')`, which is also the more correct choice here — no session cookie needs to survive the navigation, unlike the login-form case that pattern was borrowed from).
- Blockers or follow-up tasks:
  - None for this task's own scope. Noting for the coordinator (not a blocker here): the dashboard/onboarding lanes' `src/lib/features/<lane>/*.ts` files import value symbols via the `@/*` path alias, which plain `node --test` cannot resolve (confirmed directly — `ERR_MODULE_NOT_FOUND` for `@/lib`) unlike a type-only import, which gets erased before resolution. This task's own `lib/features/finance/` avoids the same pitfall (relative imports only, plus `@gift/ui/money`'s plain-`.ts` subpath export instead of the package's JSX root entry or this app's `@/lib/money` re-export) — flagging only in case another lane hits the same class of failure.
  - No per-entry running-balance column exists server-side (explicitly descoped by TASK-03/00) — if product wants one, that is a new `payouts` backend query, to be raised with whichever lane owns `payouts/` next.
- Ready for dependent tasks: Yes, for this task's own deliverable (TASK-17 integration/regression may now include `/earnings` and `/ledger`). Not a statement about the dashboard/onboarding lanes' concurrent, separately-owned work.
