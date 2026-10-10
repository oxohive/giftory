# Feature: Manual Order Assignment

- **Feature ID:** FEAT-011
- **Phase:** 2
- **Status:** Draft
- **Objective:** Allow an admin to assign a paid order (or individual order line items) to an approved dealer, triggering the production workflow.
- **Business Value:** Order assignment is the bridge between a customer purchase and physical production — without it, paid orders sit in limbo.
- **Scope:** Admin assignment UI, assignment entity, dealer notification, dealer portal order visibility.
- **Out of Scope:** Automated matching (Phase 5), RFQ/quotation (Phase 5), production status tracking UI (FEAT-010 covers the dealer side).

## Assignment Model

An order may contain multiple line items; each line item can be assigned to a different dealer (e.g. mugs to one dealer, t-shirts to another). In Phase 2, assignment is at the **order level** (all items go to one dealer). Line-level assignment is introduced in Phase 5 when automated matching arrives.

### `dealer_order_assignments` (app module table)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `order_id` | `uuid` | FK → OM `orders` |
| `dealer_profile_id` | `uuid` | FK → `dealer_profiles` |
| `tenant_id` | `uuid` | |
| `organization_id` | `uuid` | Dealer's organization |
| `assigned_by` | `uuid` | FK → OM `users` (admin) |
| `assigned_at` | `timestamptz` | |
| `required_by` | `date` | Production deadline set by admin |
| `status` | `text` | `assigned`, `acknowledged`, `in_production`, `ready_for_dispatch`, `dispatched`, `cancelled` |
| `status_updated_at` | `timestamptz` | |
| `status_note` | `text` | Nullable — dealer's note on the latest status change |
| `cancelled_reason` | `text` | Nullable |
| `deleted_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

## Requirements

1. An admin can assign any paid, unassigned order to an approved dealer from the order detail page in the admin panel.
2. The assignment UI shows only dealers whose capabilities include the product types in the order.
3. The admin sets a `required_by` production deadline at assignment time.
4. On assignment, the system:
   - Creates a `dealer_order_assignments` record.
   - Emits `dealer_order.assigned` domain event.
   - Sends the dealer an email notification with a link to the order in the dealer portal.
5. An admin can reassign an order to a different dealer (cancels the previous assignment, creates a new one).
6. An admin can cancel an assignment with a reason.
7. The order detail in the admin panel shows current assignment status and history.
8. Assignment endpoints require an `Idempotency-Key` header.
9. An assignment can only be created for an order with payment status `paid`.

## API Contract

### Admin-facing

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/orders/:id/assignment` | Get current assignment |
| `POST` | `/api/admin/orders/:id/assignment` | Assign to dealer (`Idempotency-Key` required) |
| `PUT` | `/api/admin/orders/:id/assignment` | Reassign to different dealer |
| `DELETE` | `/api/admin/orders/:id/assignment` | Cancel assignment (body: `{ reason }`) |
| `GET` | `/api/admin/dealers/:dealerId/orders` | Orders assigned to a dealer |

### Dealer-facing (FEAT-010 portal calls these)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dealer/orders` | My assigned orders |
| `GET` | `/api/dealer/orders/:id` | Order detail |
| `POST` | `/api/dealer/orders/:id/status` | Update status |

## Dependencies

- FEAT-008 / FEAT-009 — dealer must be approved and have an org
- Open Mercato `orders` module — order must exist and be `paid`
- Email notifications on `dealer_order.assigned`

## Related Stories

- [US-005](../stories/US-005-dealer-marketplace-foundation.md) — AC #3, #4
