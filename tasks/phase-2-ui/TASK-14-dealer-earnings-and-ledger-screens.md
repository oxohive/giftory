# P2-UI-14: Dealer earnings and ledger screens

- Status: Planned; implementation not started
- Owner lane: E
- Depends on: P2-UI-00, P2-UI-01, P2-UI-02, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/earnings/; src/app/(portal)/ledger/; src/components/finance/; src/lib/features/finance/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Show paginated earnings, commission details, ledger transactions, total earned and pending balance.
- [ ] Follow task 00's explicit owner/staff read permission decision.
- [ ] Convert integer INR paise for display only; format rates from basis points and keep immutable snapshots read-only.
- [ ] Use exact endpoint filters and show credits/debits clearly.

## Acceptance and verification

- [ ] Displayed balances match backend after commission, manual payout and adjustment.
- [ ] Pagination and zero balances work; no floating-point monetary drift.
- [ ] Other dealers' balances/details and write actions are inaccessible.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
