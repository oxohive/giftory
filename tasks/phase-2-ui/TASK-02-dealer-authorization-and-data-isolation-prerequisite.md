# P2-UI-02: Dealer authorization and data isolation prerequisite

- Status: Planned; implementation not started
- Owner lane: A
- Depends on: P2-UI-00
- Owned paths: Backend non-UI code in dealer_orders/, commissions/, payouts/ and dealer_org_rbac/ authorization/setup; scoped security tests

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Derive dealer identity from authenticated tenant and organization for every orders, earnings, ledger, balance, detail and status endpoint.
- [ ] Reject unauthorized caller-supplied dealer IDs; enforce ownership in reads and mutations; fail closed on missing scope and unapproved/inactive dealer.
- [ ] Reconcile dealer owner/staff feature grants, new setup and existing-account update procedure without automatically migrating or reseeding live accounts.
- [ ] Use framework capability checks; preserve admin scope, public contracts and existing behavior unless a documented correction is required.

## Acceptance and verification

- [ ] Two dealers in the same tenant cannot read or mutate one another's records, including guessed IDs and changed query strings.
- [ ] Cross-tenant, anonymous, inactive and pending dealer checks pass at route level.
- [ ] Owner/staff capability matrix passes; existing admin and unit tests remain valid.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
