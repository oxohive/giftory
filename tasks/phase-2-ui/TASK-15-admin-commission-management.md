# P2-UI-15: Admin commission management

- Status: Planned; implementation not started
- Owner lane: E
- Depends on: P2-UI-00, P2-UI-02
- Owned paths: commissions/backend/; commissions/components/; commissions/widgets/; commissions/i18n/ under apps/mercato/src/modules/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Create rules list, create and deactivate flows for platform, dealer and product-type rules.
- [ ] Explain effective dates, priority and basis-point conversion; use actual supported bounds.
- [ ] Add read-only order commission snapshot tab and dealer commission history.
- [ ] Keep snapshot immutable and historical rate intact after rule changes.

## Acceptance and verification

- [ ] Rule precedence and correct INR amount displayed on a newly assigned order.
- [ ] Rule deactivation does not rewrite existing snapshots.
- [ ] Permission, validation, empty and failure states checked.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
