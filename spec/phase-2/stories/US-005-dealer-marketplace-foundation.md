# US-005: Dealer Marketplace Foundation

- **Phase:** 2
- **Status:** Implemented, **not yet Done** (re-checked 2026-11-23). All seven acceptance criteria are implemented, and most were exercised at API level. Done is blocked by unverified email delivery, unapplied production migrations, no browser check, and the unmet US-002 dependency. See "Verification status" below.
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

## Verification status (2026-11-23)

Evidence key:
- **Live:** the API-level integration journey `apps/mercato/src/modules/dealer_orders/__integration__/dealer-marketplace-journey.spec.ts`, 12/12 on 2026-10-20, against a disposable local Postgres and production build. Not the deployed environment.
- **Unit:** Jest tests in the named module.
- **Browser:** none exists for any criterion.

| AC | Implemented | Evidence | Met? |
|---|---|---|---|
| 1. Registration, KYC upload, status visible | Yes (`dealer_onboarding`; portal `/onboarding/*`) | Live: register, multipart upload, and `pending_verification → under_review → rejected → under_review → approved`. The dealer-side status GET and status page were not exercised | Met at API level |
| 2. Admin review/approve/reject with reason; approval email with portal link | Yes (admin `/backend/dealers/applications`; `notify-dealer-on-approval.ts`) | Live: approve, reject with reason, and early-approve 400. Unit: `dealer_onboarding/__tests__/notificationEmails.test.ts`, `reviewNotifications.test.ts`. The approval email was **not** asserted live. In production the email depends on `DEALER_PORTAL_BASE_URL` and an email provider, neither of which is in `infra/ecs.tf` | Partly: email delivery unverified |
| 3. Admin configures capabilities | Yes (admin `/backend/dealers/[id]`; `PUT /api/dealer_org_rbac/admin/dealers/{id}/capabilities`) | Unit only. Live exercised the **dealer-owner** capabilities route, not the admin one | Implemented, not live-verified |
| 4. Admin assigns a paid order with deadline; dealer emailed | Yes (assignment tab on the sales order; `notify-dealer-on-assignment.ts`) | Live: assign with `requiredBy` and `Idempotency-Key` returns 201, on a paid order inserted by SQL (no real payment). Unit: `dealer_orders/__tests__/notifyOnAssignment.test.ts`. Email not asserted live | Partly: email delivery unverified |
| 5. Dealer views assigned orders/details and updates status | Yes (portal `/orders`, `/orders/[id]`) | Live: list, cross-dealer 404 on detail, and `acknowledged → in_production → ready_for_dispatch → dispatched`, after which it is terminal. The portal pages were not rendered | Met at API level |
| 6. Commission snapshot from rules at assignment | Yes (`commissions`) | Live: one snapshot row was created at assignment, with 0 bps because no rule existed. Unit: rule precedence and paise arithmetic | Met (precedence verified by unit tests only) |
| 7. Ledger credit; owner sees balance and earnings | Yes (`payouts`; portal `/earnings`, `/ledger`) | Live: a `commission_earned` row was created, plus dealer earnings list and balance 200 and a payout of 201. The balance values were not asserted | Met at API level |

What is still needed before Done:
- the `dealer_onboarding`/`dealer_org_rbac`/`payouts` migrations applied to the real database(s)
- production email configuration (`APP_URL`, `DEALER_PORTAL_BASE_URL`, provider, from-address), plus one observed real approval email and one real assignment email
- a browser pass over the portal and admin screens
- the dependency below

Dependency status:
- **US-002 is still In Progress.**
- ADR-003 is Accepted.
- **ADR-001 and ADR-002 are still `Proposed`**, although the implementation already assumes India/INR and a manual payout ledger.

Steps for all of these are in [tasks/phase-2-ui/DELIVERY.md](../../../tasks/phase-2-ui/DELIVERY.md).

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
