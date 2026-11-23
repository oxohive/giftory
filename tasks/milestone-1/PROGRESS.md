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
| WS-A | Money safety: idempotency replay, payout balance guard, adjustment balance math (known gaps 2–4) | [WS-A-money-safety.md](WS-A-money-safety.md) | Running |
| WS-B | KYC/security hardening: PII encryption scope, upload `storageKey` validation, register `organizationId` trust (known gaps 5–7) | [WS-B-kyc-security.md](WS-B-kyc-security.md) | Running |
| WS-C | Phase 1 backend unit tests: cart, checkout, Stripe, gift catalog, storefront API | [WS-C-phase1-tests.md](WS-C-phase1-tests.md) | Running |
| WS-D | Test tooling + CI: Windows path test fix, dealer-portal tests in CI, mobile test run | [WS-D-test-ci.md](WS-D-test-ci.md) | **Merged** — mercato 638/638, dealer-portal 300/300, packages 8/8 + 15/15, mobile 44/44; CI now runs package + dealer-portal tests |
| WS-E | Migrations review + runbook, second-tenant isolation test, local end-to-end + Phase 1 regression runs | [WS-E-migrations-isolation-e2e.md](WS-E-migrations-isolation-e2e.md) | Running |
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

From WS-D (tests/CI):
- Review the `buildspec.yml` change before it reaches `main`; the first CodeBuild run is the real test of the dealer-portal install.
- Decide on lockfiles. The root `.gitignore` excludes `package-lock.json`, so CI can't use `npm ci`. Recommendation: commit lockfiles, switch CI to `npm ci --ignore-scripts`, then add storefront typecheck/lint to CI.
- Dealer-portal `npm run typecheck` fails, and did before this run: TypeScript follows `@gift/ui` into `packages/ui`, which has no `node_modules`. Suggested fix: try `"preserveSymlinks": true`.
- Mobile tests belong in a separate CI job; the Expo install takes about 2.5 minutes.

## Log

- 2026-11-23 — Branch created, workstreams launched in parallel, each in its own git worktree at `C:\Users\danie\Gift-App-wt\ws-a` … `ws-g` on branches `m1/ws-a` … `m1/ws-g` (the automatic worktree feature failed on a `c:` vs `C:` path check, so they were created by hand). The coordinator merges each into `milestone-1-hardening` after re-running the tests.
- WS-G finished → merged (docs only, 34 files). It found that known gap 6 (KYC `storageKey`) looks already fixed in code and that a `money.ts` comment contradicts the balance math; both were forwarded to WS-B and WS-A while they were still running.
- WS-D finished → `buildspec.yml` diff reviewed (new steps run before the Docker build, CodeBuild already on Node 24) → merged.
