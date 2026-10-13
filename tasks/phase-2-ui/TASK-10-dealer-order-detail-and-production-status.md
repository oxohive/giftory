# P2-UI-10: Dealer order detail and production status

- Status: Planned; implementation not started
- Owner lane: C
- Depends on: P2-UI-01, P2-UI-02, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/orders/[id]/; src/components/orders/detail/; src/lib/features/orders/detail.ts

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Show order line requirements, gift message, quantity, deadline and permitted delivery city/pincode.
- [ ] Implement detail and /status route with optional note and only allowed forward transitions from backend constants.
- [ ] Refresh after successful mutation; handle cancelled, reassigned, stale, forbidden and missing assignments.
- [ ] Do not add 3D proof review or full courier integration.

## Acceptance and verification

- [ ] assigned -> acknowledged -> in_production -> ready_for_dispatch -> dispatched verified.
- [ ] Invalid/backward and cross-dealer transitions rejected server-side.
- [ ] Customer PII beyond agreed fulfillment data never appears.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
