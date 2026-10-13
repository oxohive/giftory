# P2-UI-16: Admin ledger, payout recording and adjustments

- Status: Planned; implementation not started
- Owner lane: E
- Depends on: P2-UI-00, P2-UI-02
- Owned paths: payouts/backend/; payouts/components/; payouts/i18n/ under apps/mercato/src/modules/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Build dealer ledger/balance views and filters.
- [ ] Add manual payout recording and credit/debit adjustment dialogs with required reference/reason.
- [ ] Clearly say recording an externally completed payout; this action does not transfer money.
- [ ] Use exact integer paise conversion, prevent duplicate submissions and refresh balances; preserve append-only records.

## Acceptance and verification

- [ ] Recorded payout reduces pending balance without changing earned total; adjustment math checked.
- [ ] Zero, negative, fractional-paise and missing-note submissions rejected.
- [ ] No edit/delete controls for ledger entries; role checks and failure recovery verified.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
