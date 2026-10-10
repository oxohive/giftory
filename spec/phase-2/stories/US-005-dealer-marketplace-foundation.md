# US-005: Dealer Marketplace Foundation

- **Phase:** 2
- **Status:** Proposed
- **Priority:** High
- **Parent Features:** FEAT-008, FEAT-009, FEAT-010, FEAT-011, FEAT-012, FEAT-013

## User Story

As the platform operator,  
I want dealers to be able to onboard, be approved, receive order assignments, and earn commission,  
so that customized gifts can be fulfilled by qualified producers and the marketplace can operate.

## Acceptance Criteria

1. **Dealer registration:** A dealer can self-register with business details and upload KYC documents. Their application status is visible to them as `pending_verification` → `under_review` → `approved` / `rejected`.

2. **Admin approval:** An admin can review a dealer application, view uploaded documents, and approve or reject it with a reason. On approval, the dealer receives an email with a portal link.

3. **Capability configuration:** An admin can configure a dealer's production capabilities (product types, printing methods, service area, daily capacity).

4. **Order assignment:** An admin can assign a paid, unassigned order to an approved dealer with a production deadline. The dealer receives an email notification.

5. **Dealer portal — order visibility:** A logged-in dealer can view their assigned orders, see order details (product, quantity, deadline), and update production status (`acknowledged` → `in_production` → `ready_for_dispatch` → `dispatched`).

6. **Commission snapshot:** When an order is assigned, commission is calculated from configured rules and recorded as an immutable snapshot.

7. **Ledger:** Commission earned appears in the dealer's ledger. A dealer owner can view their balance and earnings history.

## Out of Scope

- Automated dealer matching (Phase 5)
- RFQ / quotation (Phase 5)
- Actual payout disbursement (Phase 9)
- 3D proof review (Phase 3–4)

## Dependencies

- US-002 (Phase 1 test suite passing) must be done first
- ADR-001 (region), ADR-002 (payout provider), ADR-003 (dealer org model) must be resolved

## Breakdown

| Feature | Stories covered |
|---|---|
| [FEAT-008](../features/FEAT-008-dealer-onboarding.md) | AC #1, #2 |
| [FEAT-009](../features/FEAT-009-dealer-org-rbac.md) | AC #2, #3 |
| [FEAT-010](../features/FEAT-010-dealer-portal.md) | AC #4, #5 |
| [FEAT-011](../features/FEAT-011-order-assignment.md) | AC #4, #5 |
| [FEAT-012](../features/FEAT-012-commission-engine.md) | AC #6 |
| [FEAT-013](../features/FEAT-013-payout-foundation.md) | AC #7 |
