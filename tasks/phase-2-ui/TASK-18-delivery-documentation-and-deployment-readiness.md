# P2-UI-18: Delivery documentation and deployment readiness

- Status: In progress. Documentation was delivered 2026-11-23 (WS-G, branch `m1/ws-g`). Deployment-readiness items need a human and are listed in DELIVERY.md. See Agent handoff.
- Owner lane: A
- Depends on: P2-UI-17
- Owned paths: tasks/phase-2-ui/; phase2 status specs; README documentation; deployment configuration only in separately reviewed implementation changes

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Update feature statuses to verified implementation state and document run/install/seed prerequisites without exposing secrets. Done in `spec/phase-2/features/*`, `spec/phase-2/index.md`, and [DELIVERY.md](DELIVERY.md) §8.
- [x] Prepare deployment configuration/plan for portal host, backend URL, session/cookie domain, HTTPS, invitation links and health checks. Done as a **plan** ([DELIVERY.md](DELIVERY.md) §2, §5). No configuration was changed.
- [x] List exact environment-variable names and dependency order; include rollback and smoke-test steps. See [DELIVERY.md](DELIVERY.md) §3, §5.2–5.5.
- [x] Do not apply infrastructure, migrate live DB, push or publish as part of this planning task; future deployment must use the user's then-current authorization. Nothing was applied, migrated, pushed or published.

## Acceptance and verification

- [ ] Runbook is reproducible, all task statuses agree with evidence and unresolved issues are explicit. The statuses and open issues are done (README index, DELIVERY.md §6). Reproducibility of the deployment runbook is **not** shown, because it has not been executed.
- [x] Portal deployment artifact builds; production prerequisites identified. `npm run build` of `apps/dealer-portal` succeeded on 2026-11-23, and the prerequisites are in DELIVERY.md §3, §5.
- [x] Final report distinguishes implementation complete, tested and deployed. See DELIVERY.md §1.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions. Not done: this pass changed only documentation, so it had no behavior to test.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: In progress. The documentation is complete. The deployment-readiness items in DELIVERY.md §7 need a human, and P2-UI-18 is not Done until they are carried out.
- Changed files (WS-G, branch `m1/ws-g`, 2026-11-23):
  - `tasks/phase-2-ui/DELIVERY.md` (new): delivery, deployment plan, env vars, smoke test, rollback, open issues
  - `tasks/phase-2-ui/README.md`: dated status summary and task index with commits and evidence
  - `tasks/phase-2-ui/TASK-00` … `TASK-18`: status lines
  - `docs/phase-2-status.md` (rewritten), `docs/phase-2-testing-guide.md` (coverage annotations)
  - `spec/phase-2/index.md`, `spec/phase-2/features/FEAT-009` … `FEAT-013` (status), `spec/phase-2/stories/US-005` (status and verification table)
  - `README.md`, `CLAUDE.md`: small factual corrections
  - Full list and reasons: `tasks/milestone-1/WS-G-docs.md`
- Verified contracts: none newly verified against a running server. Every deployment fact was read from `infra/*.tf`, `buildspec.yml`, `apps/mercato/Dockerfile`, `apps/dealer-portal/src/app/api/om/[...path]/route.ts`, the `@open-mercato` packages installed in `apps/mercato/node_modules`, and the module source.
- Commands and results (2026-11-23, in the `m1/ws-g` worktree):
  - `cd apps/dealer-portal && npm install --no-package-lock && npm install --prefix ../../packages/ui --legacy-peer-deps --no-package-lock` succeeded.
  - `npm run typecheck` was clean. `npm run lint` gave 0 errors and 2 known warnings (`window.location.assign` in `LogoutButton.tsx`/`ResetPasswordForm.tsx`). `npm test` passed 300/300. `npm run build` succeeded with 18 pages plus 3 route handlers.
  - The `apps/mercato` integration journey was **not** re-run here. The 12/12 result is the 2026-10-20 run recorded in VERIFICATION.md.
- Blockers or follow-up tasks: DELIVERY.md §6 (open issues) and §7 (human actions). The biggest ones:
  - the migrations have not been applied to real databases
  - per `infra/ecs.tf`, the ECS task definition has no `APP_URL`, `DEALER_PORTAL_BASE_URL`, email provider or from-address, so production dealer emails very likely cannot be sent
  - `infra/vercel.tf`'s dealer-portal project name and install command disagree with the real hand-made Vercel project
- Ready for dependent tasks: n/a (last task in the pack)
