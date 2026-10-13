# P2-UI-12: Admin dealer directory and capabilities

- Status: Planned; implementation not started
- Owner lane: D
- Depends on: P2-UI-00, P2-UI-03
- Owned paths: dealer_org_rbac/backend/; dealer_org_rbac/components/; dealer_org_rbac/i18n/ under apps/mercato/src/modules/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Create dealer list/detail with supported search/state/pagination and KYC/capability summaries.
- [ ] Provide capability configuration for approved dealers using actual validators.
- [ ] Link to dealer orders and finance screens using stable route handoff.
- [ ] Do not present product-type or KYC filters unless server support exists.

## Acceptance and verification

- [ ] Admin can save and reload capability configuration on approved dealer.
- [ ] Unsupported and invalid values show useful errors.
- [ ] Employee/read-only permissions and direct route denial checked.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
