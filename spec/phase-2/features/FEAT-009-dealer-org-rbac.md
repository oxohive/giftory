# Feature: Dealer Organization & RBAC

- **Feature ID:** FEAT-009
- **Phase:** 2
- **Status:** Draft
- **Objective:** Model dealers as organizations within Open Mercato, define their roles and permissions, and configure their production capabilities.
- **Business Value:** Without a proper organization model and access control, dealers cannot have isolated data, and the admin cannot restrict what each dealer sees or does.
- **Scope:** Dealer organization creation on approval, dealer roles (owner, staff), permission scopes, capability configuration (product types, printing methods, capacity).
- **Out of Scope:** Dealer onboarding flow (FEAT-008), dealer portal UI (FEAT-010).

## Dealer Organization Model

On KYC approval (FEAT-008), the system creates or promotes an OM organization:

- **Organization type:** `dealer` (custom type flag on OM organization)
- **Primary user:** the registered dealer becomes the organization owner
- **Isolation:** all dealer data (orders, capacity, earnings) is scoped to `tenantId + organizationId`

### Dealer Roles

| Role | Permissions |
|---|---|
| `dealer:owner` | Full access to dealer portal; manage staff, profile, bank details |
| `dealer:staff` | View assigned orders, update production status; no financial access |

Roles are enforced server-side on every dealer API route. Staff cannot access commission or payout data.

## Dealer Capabilities

An approved dealer declares what they can produce. This is used by the manual assignment UI (Phase 2) and later by the automated matching scorer (Phase 5).

### `dealer_capabilities` (app module table)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `dealer_profile_id` | `uuid` | FK → `dealer_profiles` |
| `tenant_id` | `uuid` | |
| `product_type_codes` | `text[]` | e.g. `mug`, `tshirt`, `photo_frame` |
| `printing_methods` | `text[]` | `sublimation`, `dtg`, `laser_engraving`, `uv_print`, `offset` |
| `max_daily_capacity` | `int` | Units per day across all order types |
| `serviceable_states` | `text[]` | ISO 3166-2:IN state codes |
| `min_order_qty` | `int` | Default 1 |
| `updated_at` | `timestamptz` | |

## Requirements

1. On dealer approval, an OM organization of type `dealer` is created (or linked) and the dealer user is assigned `dealer:owner`.
2. The dealer owner can invite staff users; staff are assigned `dealer:staff`.
3. An admin can view and edit a dealer's capability configuration.
4. A dealer owner can edit their own capability configuration from the dealer portal.
5. All dealer API routes verify `dealer:owner` or `dealer:staff` scope before serving data — no cross-dealer data leakage.
6. `tenantId` must be derived from the authenticated session, never from the request payload.

## API Contract

### Admin-facing

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/dealers` | List active dealers |
| `GET` | `/api/admin/dealers/:id` | Dealer detail + capabilities |
| `PUT` | `/api/admin/dealers/:id/capabilities` | Update capabilities |

### Dealer-facing (requires `dealer:owner` or `dealer:staff`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dealer/profile` | Get own profile + capabilities |
| `PUT` | `/api/dealer/profile/capabilities` | Update capabilities (owner only) |
| `POST` | `/api/dealer/staff/invite` | Invite staff user (owner only) |

## Dependencies

- [ADR-003](../decisions/ADR-003-dealer-org-model.md) — confirms whether OM `directory` covers this
- FEAT-008 — dealer profile must exist before org/RBAC setup
- Open Mercato RBAC / `organizations` module

## Related Stories

- [US-005](../stories/US-005-dealer-marketplace-foundation.md) — AC #2
