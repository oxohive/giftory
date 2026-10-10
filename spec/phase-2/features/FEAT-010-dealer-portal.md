# Feature: Dealer Portal App

- **Feature ID:** FEAT-010
- **Phase:** 2
- **Status:** Draft
- **Objective:** Give dealers a dedicated web application to view assigned orders, update production status, and manage their profile and capabilities.
- **Business Value:** Without a portal, dealers have no structured way to receive orders or report progress — all coordination would be manual and untracked.
- **Scope:** New `apps/dealer-portal` Next.js app; authentication; dashboard; assigned order list; order detail; production status updates; profile and capability management.
- **Out of Scope:** 3D proof viewing and approval (Phase 3–4), automated matching UI (Phase 5), payout disbursement (Phase 9).

## App Overview

| Property | Value |
|---|---|
| App path | `apps/dealer-portal` |
| Port | 3200 (dev) |
| Framework | Next.js (same version as storefront) |
| Auth | Open Mercato auth with `dealer:owner` / `dealer:staff` roles |
| API base | `apps/mercato` backend (same as storefront) |

## Pages

| Route | Description | Role required |
|---|---|---|
| `/` | Dashboard — pending orders, recent activity, capacity overview | owner, staff |
| `/orders` | List of orders assigned to this dealer | owner, staff |
| `/orders/[id]` | Order detail — line items, design requirements, production deadline | owner, staff |
| `/orders/[id]/status` | Update production status for an order | owner, staff |
| `/profile` | Dealer profile (business info, capabilities, service area) | owner |
| `/profile/capabilities` | Edit printing methods, product types, capacity | owner |
| `/staff` | Manage staff users (invite, deactivate) | owner |
| `/earnings` | Commission earned per order — read-only ledger view | owner |

## Order Status Flow (Phase 2)

In Phase 2, a dealer manually updates order status. Full state machine enforcement comes in Phase 4.

```
assigned → acknowledged → in_production → ready_for_dispatch → dispatched
```

The dealer updates status from the order detail page. Each transition is timestamped and attributed.

## Requirements

1. A dealer logs in with their registered email — the app resolves their `dealer:owner` or `dealer:staff` role automatically.
2. The dashboard shows a count of: orders pending acknowledgment, orders in production, orders dispatched this week.
3. The orders list is filterable by status and sortable by deadline.
4. Order detail shows: customer's gift message (if any), product name, variant, quantity, required production date, and delivery address (city + pincode only — no PII beyond what's needed for shipping).
5. A dealer can update order status with an optional note at each step.
6. Status updates emit a domain event (`dealer_order.status_updated`) consumed by the notification worker.
7. A dealer cannot see orders assigned to other dealers.
8. The dealer portal shares the `packages/ui` design system with the storefront.

## Dependencies

- FEAT-008 — dealer must be approved
- FEAT-009 — dealer RBAC roles
- FEAT-011 — orders must be assigned before they appear in the portal
- `packages/ui` — shared design system (to be created in Phase 2)

## Related Stories

- [US-005](../stories/US-005-dealer-marketplace-foundation.md) — AC #3, #4
