# P2-UI-07: Dealer staff management screens

- Status: Planned; implementation not started
- Owner lane: B
- Depends on: P2-UI-01, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/staff/; src/components/staff/; src/lib/features/staff/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Create owner-only staff list, invitation and deactivation UX using verified lifecycle endpoints.
- [ ] Show actual invite/member states and delivery errors without inventing resend support.
- [ ] Confirm deactivation and explain loss of access; protect owner and current-user cases.

## Acceptance and verification

- [ ] Owner invites a user, invitation can be activated, list refreshes and deactivation removes access.
- [ ] Staff cannot invoke management APIs or access management routes.
- [ ] Duplicate email, failed invitation and empty list states handled.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
