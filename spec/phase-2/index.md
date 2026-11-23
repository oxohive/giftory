# Phase 2 — Dealer Marketplace

- **Status:** Implemented on `main` (PR #2). Not yet complete: migrations are unapplied in real environments, there has been no browser test, and US-005 is not Done. See [docs/phase-2-status.md](../../docs/phase-2-status.md) (re-checked 2026-11-23).
- **Depends on:** Phase 1 complete (US-002 passing)
- **Goal:** Enable dealers to onboard, receive manual order assignments, and earn commission — the fulfillment backbone for customizable gifts.

## Scope

Phase 2 MVP delivers:

1. Dealer registration, profile, and KYC onboarding
2. Admin approval and capability configuration
3. Manual order assignment by admin
4. Dealer portal — dealers view assigned orders and production requirements
5. Commission calculation and snapshot per order line
6. Payout foundation (ledger, not disbursement — automated payouts are Phase 9)

**Excluded from Phase 2:**
- Automated dealer matching (Phase 5)
- RFQ / quotation flow (Phase 5)
- Actual payout disbursement / split payment routing (Phase 9)
- 3D proof workflow (Phase 3–4)
- BullMQ workers (Phase 4)

## Feature Index

| ID | Feature | Status |
|---|---|---|
| [FEAT-008](features/FEAT-008-dealer-onboarding.md) | Dealer Onboarding & KYC | Implemented (some requirements partial; see the feature file) |
| [FEAT-009](features/FEAT-009-dealer-org-rbac.md) | Dealer Organization & RBAC | Implemented (some requirements partial; see the feature file) |
| [FEAT-010](features/FEAT-010-dealer-portal.md) | Dealer Portal App | Implemented (some requirements partial; see the feature file) |
| [FEAT-011](features/FEAT-011-order-assignment.md) | Manual Order Assignment | Implemented (some requirements partial; see the feature file) |
| [FEAT-012](features/FEAT-012-commission-engine.md) | Commission Engine | Implemented (some requirements partial; see the feature file) |
| [FEAT-013](features/FEAT-013-payout-foundation.md) | Payout Foundation (Ledger) | Implemented (some requirements partial; see the feature file) |

## User Stories

| ID | Story | Status |
|---|---|---|
| [US-005](stories/US-005-dealer-marketplace-foundation.md) | Dealer Marketplace Foundation | Implemented, not yet Done (see story) |

## Open Decisions (originally "must resolve before implementation")

Implementation went ahead anyway. As of 2026-11-23, ADR-001 and ADR-002 are still `Proposed`, and ADR-003 is `Accepted`.

| # | Decision | ADR |
|---|---|---|
| #1 | Target launch region / currency | [ADR-001](../decisions/ADR-001-target-region.md) |
| #2 | Payment provider for split payouts | [ADR-002](../decisions/ADR-002-payout-provider.md) |
| #3 | Does OM `directory` module cover dealer org model? | [ADR-003](../decisions/ADR-003-dealer-org-model.md) |
| #4 | Open Mercato license inventory | Ops task — required before production |

## New Apps & Packages

| Artifact | Description |
|---|---|
| `apps/dealer-portal` | Dealer-facing Next.js app (port 3200) |
| `packages/ui` | Shared design system (storefront + dealer portal) |
| `packages/api-client` | Hand-written typed client for the dealer portal's BFF proxy (not generated) |
