# P2-UI-13: Admin order assignment UI

- Status: Planned; implementation not started
- Owner lane: D
- Depends on: P2-UI-00, P2-UI-02, P2-UI-03
- Owned paths: dealer_orders/backend/; dealer_orders/components/; dealer_orders/widgets/; dealer_orders/i18n/ under apps/mercato/src/modules/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Extend installed sales order detail using verified injection slot (candidate sales.document.detail.order:tabs); do not modify framework source.
- [ ] Show current assignment and assign/reassign/cancel with approved dealer picker, production deadline and reason.
- [ ] Generate stable idempotency keys per user operation/retry; distinguish a deliberate new operation from a retry.
- [ ] Respect paid-order and status constraints. Do not invent assignment history from current-only endpoint.
- [ ] Coordinate separate commission tab ownership with lane E.

## Acceptance and verification

- [ ] Paid order can be assigned and appears in dealer portal; unpaid assignment rejected.
- [ ] Retry/double-click creates no duplicate; reassign/cancel refresh correctly.
- [ ] Original sales order UI still works, with permission and conflict states tested.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
