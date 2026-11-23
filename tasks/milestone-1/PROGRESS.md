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
| WS-D | Test tooling + CI: Windows path test fix, dealer-portal tests in CI, mobile test run | [WS-D-test-ci.md](WS-D-test-ci.md) | Running |
| WS-E | Migrations review + runbook, second-tenant isolation test, local end-to-end + Phase 1 regression runs | [WS-E-migrations-isolation-e2e.md](WS-E-migrations-isolation-e2e.md) | Running |
| WS-F | Dealer portal accessibility pass | [WS-F-accessibility.md](WS-F-accessibility.md) | Running |
| WS-G | Docs: P2-UI-18 delivery docs, stale status docs, task statuses | [WS-G-docs.md](WS-G-docs.md) | Running |

## Things only you can do (collected from all workstreams)

_(filled in when the run finishes)_

## Log

- 2026-11-23 — Branch created, workstreams launched in parallel, each in its own git worktree.
