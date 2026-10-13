# P2-UI-00: Contract audit and implementation preflight

- Status: Planned; implementation not started
- Owner lane: A
- Depends on: None
- Owned paths: Planning documents under tasks/phase-2-ui/ only

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Read FEAT-008 through FEAT-013, US-005 and ADRs; reconcile draft specs against actual route handlers, validators, ACL and setup files.
- [ ] Record exact method/path/request/response/error/pagination/permission contracts in API-CONTRACTS.md; label proposed endpoints as proposed until implemented.
- [ ] Resolve owner versus staff earnings access (FEAT-010 says owner; existing backend intentions differ), KYC pending-user authentication, assignment-ID versus order-ID, assignment history, running ledger balance, eligible-dealer filtering and business-profile edit scope. Verify inactive-rule filters against actual boolean parsing.
- [ ] Locate missing Open Mercato harness guidance referenced by apps/mercato/AGENTS.md through its documented initialization workflow before backend implementation. No fabricated skills or guessed installed framework APIs.
- [ ] Freeze route groups, component exports, navigation entries, permission matrix, package linking, optimistic-concurrency/version contracts and agent file ownership in CONTRACT-HANDOFF.md.

## Acceptance and verification

- [ ] Every screen maps to a verified contract or named prerequisite task.
- [ ] No UI task is marked ready while its required API or auth contract is unresolved.
- [ ] Record baseline Git status and existing test failures separately from new regressions.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
