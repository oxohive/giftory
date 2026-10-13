# P2-UI-08: Dealer dashboard

- Status: Planned; implementation not started
- Owner lane: C
- Depends on: P2-UI-01, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/page.tsx; src/components/dashboard/; src/lib/features/dashboard/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Show pending acknowledgment, in-production and dispatched-this-week counts, recent activity and available capacity data.
- [ ] Use actual aggregate API with documented timezone/week boundary; link cards to filtered orders.
- [ ] Show unavailable values honestly when data is absent; no synthetic activity or invented capacity utilization.

## Acceptance and verification

- [ ] Counts agree with seeded backend data beyond a single page.
- [ ] Each card opens the correct filter; loading, no-orders, error and retry states work.
- [ ] Responsive owner/staff experience checked.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
