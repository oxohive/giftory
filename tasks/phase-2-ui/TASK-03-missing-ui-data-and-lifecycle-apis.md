# P2-UI-03: Missing UI data and lifecycle APIs

- Status: Planned; implementation not started
- Owner lane: A
- Depends on: P2-UI-00, P2-UI-02
- Owned paths: Backend non-UI code in dealer_onboarding/, dealer_org_rbac/, dealer_orders/; related API specs/tests

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Implement or reuse verified secure KYC upload/presign/download transport; metadata registration alone is not file upload.
- [ ] Provide safe dealer order detail with product, variant, quantity, gift message, production requirements/deadline and city/pincode only; distinguish assignment ID from sales order ID.
- [ ] Provide server deadline sorting and accurate dashboard aggregates with defined date/timezone semantics; do not compute totals from one paginated page.
- [ ] Provide scoped staff list/deactivation and invitation lifecycle needed by the spec using installed auth commands; prevent owner/self-deactivation and revoke access appropriately.
- [ ] Verify registration-to-login/invitation and approval/rejection email links and delivery hooks; support pending/rejected applicants securely.
- [ ] Resolve required assignment history, eligible-dealer filtering and ledger running-balance projections identified in task 00; implement missing contracts rather than computing misleading results from a page. Add version checks/409 responses for editable mutations as required by local guidance.
- [ ] Business profile is read-only unless an edit contract is expressly agreed in task 00. Document remaining contract limitations.

## Acceptance and verification

- [ ] KYC files are private and only authorized applicant/reviewer can access them.
- [ ] Dashboard totals and order sorting are correct across multiple pages.
- [ ] Invite activation, staff deactivation, application approval and order notification integration have test evidence.
- [ ] Every proposed contract is updated to implemented before dependent UI is released.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
