# Milestone 1 — Close out Phase 2 + testing baseline

Overnight run started 2026-11-23. Branch: `milestone-1-hardening` (pushed to GitHub, **not merged to `main`, not deployed**).

**Read this file first.** The summary below is filled in at the end of the run; each workstream has its own handoff file in this folder with full detail.

## Morning summary

_(filled in when the run finishes)_

## Ground rules for this run (agreed before starting)

| Topic | Decision |
|---|---|
| Shared dev database (Supabase) | **Code only.** No migrations applied, no tenants created. Migrations are reviewed and a runbook is written for you to run. |
| Git | All work on `milestone-1-hardening`, committed as `jasperdanny`, pushed to GitHub. `main` untouched → no AWS deploy. |
| Infrastructure (Terraform / ECS / Vercel) | **No changes.** No `tofu import/apply`; no calls to the live dev backend. End-to-end tests only against a local backend. |
| New code | Every behaviour change ships with tests. |

## Workstreams

| ID | Workstream | Handoff file | Status |
|---|---|---|---|
| WS-A | Money safety: idempotency replay, payout balance guard, adjustment balance math (known gaps 2–4) | [WS-A-money-safety.md](WS-A-money-safety.md) | **Merged** — all three gaps fixed. Concurrency was proven on a throwaway local Postgres (5 simultaneous payouts against the balance → exactly the right number succeed). **Adds 2 migrations; the payout, adjustment and assignment routes fail until they're applied** |
| WS-B | KYC/security hardening: PII encryption scope, upload `storageKey` validation, register `organizationId` trust (known gaps 5–7) | [WS-B-kyc-security.md](WS-B-kyc-security.md) | **Merged** — gap 5 fixed (also fixed an admin-detail route that almost certainly returns 500 today), gap 6 verified already fixed and now tested, gap 7 hardened without breaking invite links; tenant ids removed from logs. **Found: GSTIN/PAN are almost certainly stored unencrypted today** (see your actions) |
| WS-C | Phase 1 backend unit tests: cart, checkout, Stripe, gift catalog, storefront API | [WS-C-phase1-tests.md](WS-C-phase1-tests.md) | **Merged** — Phase 1 tests went from 11 suites/113 tests to 26 suites/381 tests. One real bug fixed: the order page rounded amounts differently from checkout, so tax/shipping/subtotal could be off by ₹0.01 (display only). Two gaps recorded as `it.todo` |
| WS-D | Test tooling + CI: Windows path test fix, dealer-portal tests in CI, mobile test run | [WS-D-test-ci.md](WS-D-test-ci.md) | **Merged** — mercato 638/638, dealer-portal 300/300, packages 8/8 + 15/15, mobile 44/44; CI now runs package + dealer-portal tests |
| WS-E | Migrations review + runbook, second-tenant isolation test, local end-to-end + Phase 1 regression runs | [WS-E-migrations-isolation-e2e.md](WS-E-migrations-isolation-e2e.md) | **Merged, but the end-to-end runs didn't happen (Docker was off).** [RUNBOOK-migrations.md](RUNBOOK-migrations.md) covers all 5 migrations and was rehearsed on throwaway DBs. A new isolation spec checks ~75 routes across 2 tenants / 3 dealers; it typechecks but has **never run against a live backend** |
| WS-F | Dealer portal accessibility pass | [WS-F-accessibility.md](WS-F-accessibility.md) | Running |
| WS-G | Docs: P2-UI-18 delivery docs, stale status docs, task statuses | [WS-G-docs.md](WS-G-docs.md) | **Merged** — statuses corrected, new `tasks/phase-2-ui/DELIVERY.md`; P2-UI-18 stays In progress (needs you) |

## Things only you can do (collected from all workstreams)

_(being collected as workstreams finish — final, de-duplicated list goes here at the end)_

From WS-G (docs):
- Apply the three pending migrations after a backup, then run `yarn mercato auth sync-role-acls` (runbook coming from WS-E).
- **Likely production bug:** `infra/ecs.tf` sets no `APP_URL`, `DEALER_PORTAL_BASE_URL`, email provider or from-address. If the live ECS task matches, new dealers never get their invite email and can't set a password. Check the live task definition.
- Deploys never run migrations (`CMD yarn start`, no migrate step in `buildspec.yml`): decide how migrations get applied on deploy.
- `infra/vercel.tf` doesn't match the real Vercel project (named `giftory-dealer-portal` instead of `giftory`; install command missing the `packages/ui` install). Reconcile, then import it or drop the resource.
- Run the smoke test in `tasks/phase-2-ui/DELIVERY.md` §5.3.
- Decide ADR-001 (region/currency) and ADR-002 (payout provider). Both are still "Proposed".

From WS-A (money safety):
- Apply its 2 new migrations (idempotency tables) **before or together with** deploying this branch; the runbook covers them. Run `yarn generate` after merging.
- **Breaking API change** for any outside script: payout and adjustment POSTs now need `Idempotency-Key`, and keys must be 16–128 chars of `A-Za-z0-9_-:.`.
- Product call: keep `totalEarned` as commission only (current), or make it net of adjustments.
- Visible effect: any dealer on dev with existing `adjustment_credit` rows will see their pending balance go up (that's the fix).

From WS-E (migrations / isolation / e2e):
- **Follow [RUNBOOK-migrations.md](RUNBOOK-migrations.md)** from this branch right before merging to `main` (expect 5 pending). Start with its read-only pre-checks: if tables already exist without tracking rows, `yarn db:migrate` stops with "relation already exists", and the runbook has the tested fix. It also checks for missing `dealer:owner`/`dealer:staff` roles (Q5, fix in §7).
- With Docker Desktop running: `cd apps/mercato && yarn test:integration:ephemeral src/modules/dealer_orders/__integration__` (expect 22 passed; one deliberate `test.fail()` counts as a pass). Expect a few test-side fixes on the first run; WS-B's registration change may need the registration step updated.
- Run the Phase 1 regression suite using the steps in the WS-E handoff. Its seeding commands need an explicit local `DATABASE_URL`, because the real `.env` points at Supabase.
- Decide on **F4**: admin routes accept a dealer from another tenant (orphan rows, no data leak). Now known gap 8 in `docs/dealer-marketplace-api.md`.
- **F5, watch out:** the `commissions` entity declares money columns as `integer`, but the table is `numeric(18,0)`. The next `yarn db:generate` will propose downgrading them; **never accept that**. Fix the entity instead.

From WS-B (KYC/security). Exact SQL and commands are in [WS-B-kyc-security.md](WS-B-kyc-security.md):
- **GSTIN/PAN encryption is probably off.** Run the read-only SQL to confirm. Then check that a real `TENANT_DATA_ENCRYPTION_KEY` (or Vault) is in SSM, not the `.env.example` fallback. Add the targeted tenant-wide encryption map row for `dealer_onboarding:dealer_profile` only; do **not** run a blanket `seed-encryption --tenant`. Restart, then run `yarn mercato entities rotate-encryption-key --tenant <id> --dry-run`, then run it for real.
- Wider gap (not fixed): other data written in dealer orgs is probably unencrypted too, including dealer users' email/name and audit-log snapshots containing GSTIN/PAN.
- **Check before deploying WS-B:** root org `5e4fe2d8-…` must have no parent and be active, or existing dealer invite links will start returning 404.
- Decide: admin-issued single-use invite tokens (design in the handoff), and whether the unauthenticated `409 email already registered` response is acceptable (it reveals whether an email is registered).
- Check that the backend trusts the dealer portal's forwarded client IP. Otherwise all dealers share one 5-per-hour registration rate-limit bucket.

From WS-C (Phase 1 tests):
- Decide: should a payment retry be blocked while an earlier attempt is only `authorized`? It can't happen with today's automatic capture, but it becomes a double-charge risk if manual capture is ever turned on.
- Storefront address commands check the owner's organization but not the tenant, because the storefront system context carries no tenant id. Fixing that changes every storefront system command, so plan it as a separate reviewed change.
- Stripe webhook and session logic lives in the upstream `@open-mercato/gateway-stripe` package and isn't unit-tested in this repo; only our side of it is.
- Optional: add the new test files to the Evidence sections of FEAT-003/004/006 in `spec/phase-1/`.

From WS-D (tests/CI):
- Review the `buildspec.yml` change before it reaches `main`; the first CodeBuild run is the real test of the dealer-portal install.
- Decide on lockfiles. The root `.gitignore` excludes `package-lock.json`, so CI can't use `npm ci`. Recommendation: commit lockfiles, switch CI to `npm ci --ignore-scripts`, then add storefront typecheck/lint to CI.
- Dealer-portal `npm run typecheck` fails, and did before this run: TypeScript follows `@gift/ui` into `packages/ui`, which has no `node_modules`. Suggested fix: try `"preserveSymlinks": true`.
- Mobile tests belong in a separate CI job; the Expo install takes about 2.5 minutes.

## Log

- 2026-11-23 — Branch created, workstreams launched in parallel, each in its own git worktree at `C:\Users\danie\Gift-App-wt\ws-a` … `ws-g` on branches `m1/ws-a` … `m1/ws-g` (the automatic worktree feature failed on a `c:` vs `C:` path check, so they were created by hand). The coordinator merges each into `milestone-1-hardening` after re-running the tests.
- WS-G finished → merged (docs only, 34 files). It found that known gap 6 (KYC `storageKey`) looks already fixed in code and that a `money.ts` comment contradicts the balance math; both were forwarded to WS-B and WS-A while they were still running.
- WS-D finished → `buildspec.yml` diff reviewed (new steps run before the Docker build, CodeBuild already on Node 24) → merged.
- WS-B finished → merged. Combined branch: `yarn test` in `apps/mercato` **686/686 passing, 69 suites** (Windows).
- WS-C finished → reviewed its only production change (2 lines in `storefront/lib/orders.ts`, now rounding through `round2()`/`orderTotals()` like checkout) → merged. Combined branch: **84 suites, 952 passed, 2 todo, 0 failed**.
- WS-A finished → told WS-E about its 2 new migrations (WS-E added them to the runbook) → merged → `yarn generate` OK, **90 suites, 1101 passed, 2 todo, 0 failed**; typecheck 146 errors (baseline 147, so 0 new and 1 fewer).
- WS-E finished → merged (new files only). Tests unchanged at 1101 passing; lint 0 errors / 9 pre-existing warnings.
- Coordinator updated `docs/dealer-marketplace-api.md`: known gaps 2–7 rewritten from the WS-A/WS-B handoffs, new gap 8 (WS-E F4), and the balance math, payout, adjustment and assignment sections brought up to date.
