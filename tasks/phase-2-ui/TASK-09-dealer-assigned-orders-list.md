# P2-UI-09: Dealer assigned orders list

- Status: Planned; implementation not started
- Owner lane: C
- Depends on: P2-UI-01, P2-UI-02, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/orders/page.tsx; src/components/orders/list/; src/lib/features/orders/list.ts

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Build paginated list with status filtering and server-side production-deadline sorting.
- [ ] Persist pagination/filter/sort in URL; reset page on filter changes.
- [ ] Display meaningful order reference, status, deadline and supported product summary; link using assignment ID.

## Acceptance and verification

- [ ] Sorting works across pages, not only within current page.
- [ ] Filters survive reload/back navigation and empty results are clear.
- [ ] No cross-dealer data is visible; mobile and keyboard usability checked.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
