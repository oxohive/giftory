# P2-UI-17: Integration, accessibility and regression verification

- Status: Planned; implementation not started
- Owner lane: A
- Depends on: P2-UI-05, P2-UI-06, P2-UI-07, P2-UI-08, P2-UI-09, P2-UI-10, P2-UI-11, P2-UI-12, P2-UI-13, P2-UI-14, P2-UI-15, P2-UI-16
- Owned paths: apps/dealer-portal/__integration__/; consolidated test config via lane A; tasks/phase-2-ui/ evidence; regression fixes only by assigned owner

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Run complete registration -> KYC -> approval -> capabilities -> staff -> paid assignment -> commission -> ledger -> status -> payout-recording journey.
- [ ] Exercise two same-tenant dealers, a second tenant, owner, staff, admin, pending/rejected/inactive and anonymous users at API and browser levels.
- [ ] Check desktop/mobile, keyboard, labels, focus/error announcements and responsive tables.
- [ ] Run Phase 1 browsing/cart/checkout/account/admin regression suites with required fixtures; report skipped payment checks honestly.
- [ ] Run applicable generate/typecheck/lint/design-system/unit/build checks and integration tests; distinguish baseline failures.

## Acceptance and verification

- [ ] Publish commands, environment, pass/fail/skip counts and evidence in VERIFICATION.md.
- [ ] No unresolved isolation/auth failure, broken critical journey or newly introduced Phase 1 regression.
- [ ] Every task has a handoff and actual validation evidence; checklist is not treated as execution.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
