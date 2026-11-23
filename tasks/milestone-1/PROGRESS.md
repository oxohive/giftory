# Milestone 1 — Close out Phase 2 + testing baseline

Overnight run, 2026-11-23. Branch: **`milestone-1-hardening`**, pushed to GitHub (`origin/milestone-1-hardening`). It is **not merged to `main` and not deployed**: CodeBuild only triggers on `refs/heads/main`.

**Read this file first.** Each workstream has a detailed handoff file in this folder.

## Morning summary

All 7 workstreams finished and are merged into `milestone-1-hardening`. Every suite that can run without Docker passes on the merged branch:

| Suite (run on the merged branch, Windows) | Before tonight | Now |
|---|---|---|
| `apps/mercato` unit tests (`yarn test`) | 638 tests, 1 failing on Windows | **1,101 passed, 0 failed, 2 `it.todo`** (90 suites) |
| `apps/mercato` typecheck | 147 errors (pre-existing) | 146 (0 new, 1 fixed) |
| `apps/mercato` lint | 0 errors | 0 errors (9 pre-existing warnings) |
| `apps/dealer-portal` tests (`npm test`) | 300 | **300 passed** |
| `apps/dealer-portal` accessibility (`npm run test:a11y`, new) | didn't exist | **160 passed** (18 pages, 65 states, light + dark) |
| `apps/dealer-portal` build + typecheck | — | build OK, typecheck clean (see the note on `packages/ui` deps below) |
| `packages/api-client` / `packages/ui` tests | not in CI | 8/8, 15/15 (now in CI) |
| `apps/mobile` jest + tsc | never run | 44/44 passed, tsc clean (WS-D, in its worktree) |
| **End-to-end / integration** (dealer journey, new isolation spec, Phase 1 regression) | — | **NOT RUN.** Docker Desktop was off all night |

**What got fixed**
- **Money (WS-A):** duplicate assignment, payout and adjustment requests are now safely replayed instead of executed twice. Payouts can't exceed the dealer's balance, even when two arrive at once (proven on a throwaway Postgres). The balance math is fixed for `adjustment_credit`.
- **KYC/security (WS-B):** the admin dealer-application detail route, which almost certainly returns **500 today**, is fixed and now decrypts with the correct scope. KYC document reads are proven tenant-, dealer- and partition-confined. The registration invite link is hardened without breaking existing links. Tenant ids are removed from logs.
- **Phase 1 (WS-C):** Phase 1 tests went from 113 to 381. One display bug fixed: the order page could show tax/shipping/subtotal ₹0.01 different from checkout.
- **CI (WS-D):** the Windows test bug is fixed. CI now also runs the dealer-portal and shared-package tests before the Docker build. New [docs/testing.md](../../docs/testing.md).
- **Accessibility (WS-F):** 55 of 130 page scans failed before; all pass now. Fixes cover contrast, labels, focus handling and screen-reader announcements. Also fixed: a wrong password said "session expired".
- **Docs (WS-G + coordinator):** stale status docs and task statuses corrected. New [DELIVERY.md](../phase-2-ui/DELIVERY.md) (P2-UI-18). [dealer-marketplace-api.md](../../docs/dealer-marketplace-api.md) known gaps updated.
- **Migrations (WS-E):** [RUNBOOK-migrations.md](RUNBOOK-migrations.md) covers all **5** pending migrations, rehearsed on throwaway databases. A new cross-tenant isolation spec checks ~75 routes.

**Most important things found**
1. **GSTIN/PAN are almost certainly stored unencrypted** on dev. The encryption config had a typo and never applied. The code is fixed, but turning encryption on needs DB steps (below).
2. **Dealer invite emails probably never send.** `infra/ecs.tf` has no email provider, from-address, `APP_URL` or `DEALER_PORTAL_BASE_URL`. Not checked against the live task definition.
3. **Deploys never run migrations.** 5 are pending, and WS-A's payout/adjustment/assignment routes **fail until theirs are applied**.
4. Admin routes accept a dealer from **another tenant** (orphan rows, no data leak). Logged as known gap 8; not fixed.
5. `commissions` entity money columns are declared `integer` but the table is `numeric(18,0)`. **Never accept a `db:generate` that downgrades them.**

## What you need to do

### Before merging `milestone-1-hardening` to `main` (merging deploys)
1. **Review the branch** on GitHub, especially `buildspec.yml` (production CI) and the money/KYC changes.
2. **Start Docker Desktop and run the end-to-end tests** (never run tonight):
   `cd apps/mercato && yarn test:integration:ephemeral src/modules/dealer_orders/__integration__`. Expect 22 passed; one deliberate `test.fail()` counts as a pass. Expect a few test-side fixes on the first run (WS-B's registration change may affect the registration step). Then run the Phase 1 regression using the steps in [WS-E](WS-E-migrations-isolation-e2e.md). Its seeding needs an explicit **local** `DATABASE_URL`, because `.env` points at Supabase.
3. **Check root org `5e4fe2d8-…` has no parent and is active.** Otherwise WS-B makes existing dealer invite links return 404.
4. **Apply the migrations with [RUNBOOK-migrations.md](RUNBOOK-migrations.md)**, right before merging (expect 5 pending). Read-only pre-checks first, then a backup. Handle "relation already exists" and missing `dealer:owner`/`dealer:staff` roles as the runbook says. Afterwards run `yarn mercato auth sync-role-acls`, and run `yarn generate` after merging.
5. **Tell anyone with scripts** that payout/adjustment POSTs now require `Idempotency-Key` (16–128 chars of `A-Za-z0-9_-:.`).

### Production checks
6. **Encryption for GSTIN/PAN.** Exact SQL and steps are in [WS-B](WS-B-kyc-security.md): confirm with the read-only SQL, check that a real `TENANT_DATA_ENCRYPTION_KEY` (or Vault) is in SSM, add the targeted tenant-wide map row for `dealer_onboarding:dealer_profile` only (**not** a blanket `seed-encryption --tenant`), restart, then run `entities rotate-encryption-key --dry-run` and then for real. Note: other data in dealer orgs (dealer users' email/name, audit snapshots) is probably unencrypted too.
7. **Dealer invite emails.** Check the live ECS task definition for the email/base-URL env vars, and add them through a reviewed Terraform change. Add `DEALER_PORTAL_BASE_URL` to `.env.example`.
8. Decide **how migrations run on deploy**; today nothing runs them.
9. Reconcile `infra/vercel.tf` with the real Vercel project (`giftory`, plus the `packages/ui` install command), then import it or drop the resource.
10. Check that the backend trusts the dealer portal's forwarded client IP; otherwise all dealers share one 5/hour registration rate-limit bucket.
11. Run the smoke test in [DELIVERY.md](../phase-2-ui/DELIVERY.md) §5.3 after deploying.

### Decisions
12. **ADR-001** (region/currency) and **ADR-002** (payout provider): both still "Proposed".
13. **Invite links:** move to admin-issued, single-use, expiring invite tokens? (Design in [WS-B](WS-B-kyc-security.md).) Also: is the unauthenticated `409 email already registered` acceptable, given it reveals which emails are registered?
14. **Known gap 8 / F4:** validate that admin-supplied dealer ids belong to the caller's tenant (and are approved, for assignment). Recommended: yes.
15. `totalEarned`: keep it as commission only (current), or make it net of adjustments?
16. Block a payment retry while an earlier attempt is only `authorized`? Only matters if manual capture is ever enabled.
17. Storefront address commands can't check the tenant (the storefront system context has no tenant id). Plan a separate reviewed change.
18. **Lockfiles:** the root `.gitignore` excludes `package-lock.json`, so CI can't use `npm ci`. Recommendation: commit lockfiles, switch CI to `npm ci --ignore-scripts`, then add storefront typecheck/lint, the a11y suite and mobile tests (as a separate job) to CI.
19. Accessibility, design call: the brass colour and input borders are slightly darker for contrast. Check that's acceptable for the brand. Three low-severity items are listed in [WS-F](WS-F-accessibility.md).

### Small follow-ups
- Do a real screen-reader pass (NVDA/VoiceOver) on the dealer portal; only automated/scripted checks ran.
- Fix the generic 401 "session expired" message in `packages/api-client` (WS-F worked around it in the login form only).
- `commissions` entity money columns: declare them as `numeric(18,0)` to match the table (F5).
- Add the new Phase 1 test files to the Evidence sections of FEAT-003/004/006.
- **Local setup note:** `apps/dealer-portal` needs `npm install --prefix ../../packages/ui --legacy-peer-deps` (as on Vercel) before `npm run build` / `npm run typecheck` work locally. With that done, typecheck is clean.
- Clean up the worktrees when you're done reviewing: `git worktree remove C:\Users\danie\Gift-App-wt\ws-a` (… `ws-g`), then `git branch -D m1/ws-a` (…). The merged branch has everything.

## Ground rules for this run (agreed before starting)

| Topic | Decision |
|---|---|
| Shared dev database (Supabase) | **Code only.** No migrations applied, no tenants created. The agents that needed a DB used throwaway local Postgres instances. |
| Git | All work on `milestone-1-hardening`, committed as `jasperdanny`, pushed to GitHub. `main` untouched → no AWS deploy. |
| Infrastructure (Terraform / ECS / Vercel) | **No changes.** No `tofu import/apply`; no calls to the live dev backend. |
| New code | Every behaviour change ships with tests. |

## Workstreams

| ID | Workstream | Handoff file | Result |
|---|---|---|---|
| WS-A | Money safety (known gaps 2–4) | [WS-A-money-safety.md](WS-A-money-safety.md) | Merged. Idempotent assignment/payout/adjustment writes, concurrency-safe payout balance guard, balance math fixed. Adds 2 migrations |
| WS-B | KYC/security (known gaps 5–7) | [WS-B-kyc-security.md](WS-B-kyc-security.md) | Merged. Admin detail 500 + decryption scope fixed, encryption-map id fixed, KYC reads proven confined, registration hardened, logs cleaned |
| WS-C | Phase 1 backend unit tests | [WS-C-phase1-tests.md](WS-C-phase1-tests.md) | Merged. 113 → 381 tests, 1 display rounding bug fixed, 2 gaps as `it.todo` |
| WS-D | Test tooling + CI | [WS-D-test-ci.md](WS-D-test-ci.md) | Merged. Windows test fix, package + dealer-portal tests in CI, mobile tests run, `docs/testing.md` |
| WS-E | Migrations runbook, isolation spec, e2e | [WS-E-migrations-isolation-e2e.md](WS-E-migrations-isolation-e2e.md) | Merged. Runbook for 5 migrations, cross-tenant isolation spec. **E2E not run (no Docker)** |
| WS-F | Dealer portal accessibility | [WS-F-accessibility.md](WS-F-accessibility.md) | Merged. 160/160 automated a11y checks, `npm run test:a11y` |
| WS-G | Docs and status cleanup | [WS-G-docs.md](WS-G-docs.md) | Merged. Statuses corrected, DELIVERY.md, testing guide annotated |

## Log

- 2026-11-23 — Branch created, workstreams launched in parallel, each in its own git worktree at `C:\Users\danie\Gift-App-wt\ws-a` … `ws-g` on branches `m1/ws-a` … `m1/ws-g` (the automatic worktree feature failed on a `c:` vs `C:` path check, so they were created by hand). The coordinator merged each into `milestone-1-hardening` after re-running the tests.
- WS-G finished → merged (docs only, 34 files). It found that known gap 6 (KYC `storageKey`) looked already fixed and that a `money.ts` comment contradicted the balance math; both were forwarded to WS-B and WS-A while they were still running (both confirmed and handled).
- WS-D finished → `buildspec.yml` diff reviewed (new steps run before the Docker build, CodeBuild already on Node 24) → merged.
- WS-B finished → merged. `apps/mercato`: 686/686 passing.
- WS-C finished → its only production change reviewed (2 lines in `storefront/lib/orders.ts`) → merged. 952 passed, 2 todo.
- WS-A finished → WS-E told about its 2 new migrations (added to the runbook) → merged → `yarn generate` OK, 1,101 passed, 2 todo; typecheck 146 (baseline 147).
- WS-E finished → merged (new files only). Lint 0 errors.
- Coordinator updated `docs/dealer-marketplace-api.md` (known gaps 2–8, balance math, payout/adjustment/assignment sections).
- Branch pushed to `origin/milestone-1-hardening` as a checkpoint (confirmed the CodeBuild webhook only matches `refs/heads/main`).
- WS-F finished → merged → dealer-portal `npm test` 300/300, lint 0 errors, build OK (after installing `packages/ui` deps as Vercel does), typecheck clean, `npm run test:a11y` 160/160.
- Morning summary written; final push.
