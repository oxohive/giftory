# P2-UI-06: Dealer profile and capabilities screens

- Status: Planned; implementation not started
- Owner lane: B
- Depends on: P2-UI-01, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/profile/; src/components/profile/; src/lib/features/profile/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Show business profile and editable production capabilities for owners.
- [ ] Use API enums for printing methods, product types, serviceable states, capacity and minimum quantities.
- [ ] Handle unsaved changes, validation, mutation refresh and concurrency conflicts when supported.
- [ ] Do not offer unsupported business identity editing.

## Acceptance and verification

- [ ] Owner can save and reload real capabilities; staff cannot mutate via direct requests.
- [ ] Empty/invalid capacity, state/method codes and failed save states are covered.
- [ ] Shared files and nav changes delivered to lane A.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
