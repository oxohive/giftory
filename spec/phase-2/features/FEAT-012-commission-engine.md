# Feature: Commission Engine

- **Feature ID:** FEAT-012
- **Phase:** 2
- **Status:** Draft
- **Objective:** Calculate and record the dealer's commission for each assigned order at the time of assignment, creating an immutable financial snapshot.
- **Business Value:** Commission is the dealer's incentive and the platform's revenue model. Snapshotting at assignment time protects both parties from rate changes and provides a clear audit trail.
- **Scope:** Commission rule configuration, commission calculation on order assignment, snapshot storage, dealer earnings view.
- **Out of Scope:** Actual payout disbursement (FEAT-013 + Phase 9), split payment routing (ADR-002), tax calculations (later phase).

## Commission Model

Commission is calculated as a percentage of the **order subtotal** (excluding platform fees, shipping, and tax). The rate is resolved in priority order:

1. Product-type-specific rate for this dealer (e.g. 18% for mugs)
2. Dealer-level default rate
3. Platform-wide default rate (fallback)

### `commission_rules` (app module table)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `tenant_id` | `uuid` | |
| `dealer_profile_id` | `uuid` | Nullable — null = platform-wide rule |
| `product_type_code` | `text` | Nullable — null = applies to all product types for this dealer |
| `rate_bps` | `int` | Basis points (e.g. 1800 = 18%). Integer, never float. |
| `effective_from` | `date` | |
| `effective_to` | `date` | Nullable — null = current |
| `created_by` | `uuid` | FK → OM `users` (admin) |
| `created_at` | `timestamptz` | |

### `order_commission_snapshots` (app module table)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `assignment_id` | `uuid` | FK → `dealer_order_assignments` |
| `order_id` | `uuid` | |
| `dealer_profile_id` | `uuid` | |
| `tenant_id` | `uuid` | |
| `subtotal_amount` | `int` | Minor units (INR paise) |
| `currency_code` | `text` | `INR` |
| `commission_rate_bps` | `int` | Rate at time of snapshot |
| `commission_amount` | `int` | Minor units — `ROUND(subtotal * rate_bps / 10000)` |
| `rule_id` | `uuid` | Which rule was applied |
| `snapshotted_at` | `timestamptz` | |

Snapshots are **append-only**. Never update a snapshot row.

## Requirements

1. An admin can configure commission rules: platform-wide default, per-dealer default, and per-dealer per-product-type rates.
2. Commission is calculated automatically when an order is assigned (triggered by `dealer_order.assigned` event).
3. The commission snapshot records the rate and amount at the time of assignment — subsequent rule changes do not affect past orders.
4. All monetary values are stored as integer minor units (INR paise). Zero floats in the commission engine.
5. A dealer owner can view their commission per order in the dealer portal earnings page.
6. An admin can view commission snapshots per order and per dealer.
7. If no rule is found for a dealer + product type, the platform-wide default is applied. If no platform-wide default exists, the assignment proceeds but commission is recorded as 0 with a warning logged.

## API Contract

### Admin-facing

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/commission/rules` | List active rules |
| `POST` | `/api/admin/commission/rules` | Create rule |
| `DELETE` | `/api/admin/commission/rules/:id` | Deactivate rule (sets `effective_to`) |
| `GET` | `/api/admin/orders/:id/commission` | Commission snapshot for an order |
| `GET` | `/api/admin/dealers/:id/commission` | Paginated commission history for dealer |

### Dealer-facing

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dealer/earnings` | Paginated commission snapshots for own orders |
| `GET` | `/api/dealer/earnings/:assignmentId` | Single order commission detail |

## Dependencies

- FEAT-011 — commission is triggered by order assignment
- [ADR-001](../decisions/ADR-001-target-region.md) — confirms INR as base currency
- Decision #10 (architecture.md §20) — commission rates are a business decision; placeholders needed before implementation

## Related Stories

- [US-005](../stories/US-005-dealer-marketplace-foundation.md) — AC #5
