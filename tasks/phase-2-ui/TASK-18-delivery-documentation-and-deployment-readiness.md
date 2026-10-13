# P2-UI-18: Delivery documentation and deployment readiness

- Status: Planned; implementation not started
- Owner lane: A
- Depends on: P2-UI-17
- Owned paths: tasks/phase-2-ui/; phase2 status specs; README documentation; deployment configuration only in separately reviewed implementation changes

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Update feature statuses to verified implementation state and document run/install/seed prerequisites without exposing secrets.
- [ ] Prepare deployment configuration/plan for portal host, backend URL, session/cookie domain, HTTPS, invitation links and health checks.
- [ ] List exact environment-variable names and dependency order; include rollback and smoke-test steps.
- [ ] Do not apply infrastructure, migrate live DB, push or publish as part of this planning task; future deployment must use the user's then-current authorization.

## Acceptance and verification

- [ ] Runbook is reproducible, all task statuses agree with evidence and unresolved issues are explicit.
- [ ] Portal deployment artifact builds; production prerequisites identified.
- [ ] Final report distinguishes implementation complete, tested and deployed.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
