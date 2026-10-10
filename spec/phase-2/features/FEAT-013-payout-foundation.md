# Feature: Payout Foundation (Ledger)

- **Feature ID:** FEAT-013
- **Phase:** 2
- **Status:** Draft
- **Objective:** Build an append-only ledger that records every commission earned and every payout made, so that dealer balances are always reconcilable without relying on the payment provider as the source of truth.
- **Business Value:** A durable ledger prevents disputes, enables audits, and is a prerequisite for any payout mechanism — automated or manual. Building it in Phase 2 means payouts can be added in Phase 9 without a data migration.
- **Scope:** Ledger entity, credit entries on commission snapshot, debit entries on manual payout marks, balance query, admin manual payout recording.
- **Out of Scope:** Actual money movement / split payment routing (Phase 9 + ADR-002), automated settlement (Phase 9), tax deductions.

## Ledger Model

The ledger is a double-entry-style append-only log. Each entry has a type, amount, and links back to its source.

### `dealer_ledger_entries` (app module table)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `dealer_profile_id` | `uuid` | FK → `dealer_profiles` |
| `tenant_id` | `uuid` | |
| `entry_type` | `text` | `commission_earned`, `payout_disbursed`, `adjustment_credit`, `adjustment_debit` |
| `amount` | `int` | Minor units (INR paise); always positive |
| `currency_code` | `text` | `INR` |
| `direction` | `text` | `credit` or `debit` |
| `reference_type` | `text` | `order_commission_snapshot`, `manual_payout`, `adjustment` |
| `reference_id` | `uuid` | ID of the referenced entity |
| `note` | `text` | Nullable — admin note or payout reference |
| `created_by` | `uuid` | FK → OM `users`; system or admin |
| `created_at` | `timestamptz` | Immutable |

No row is ever updated or deleted. Corrections use a new entry of type `adjustment_credit` or `adjustment_debit`.

### Balance View

Balance = SUM(amount WHERE direction = 'credit') − SUM(amount WHERE direction = 'debit')

This is computed on read (or materialized for performance). A dealer's balance represents commission earned but not yet paid out.

## Requirements

1. A `commission_earned` ledger entry is automatically created when a commission snapshot is written (FEAT-012).
2. An admin can manually record a payout disbursement, creating a `payout_disbursed` debit entry with a payment reference (e.g. bank transfer UTR number).
3. An admin can create adjustment entries with a mandatory note for corrections.
4. The ledger is append-only — no updates or deletes on `dealer_ledger_entries`.
5. An admin can view the full ledger for any dealer, with running balance.
6. A dealer owner can view their own ledger entries and current balance.
7. The balance endpoint returns: `pending_amount` (earned, not yet paid) and `total_earned` (lifetime).

## API Contract

### Admin-facing

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/dealers/:id/ledger` | Paginated ledger for a dealer |
| `GET` | `/api/admin/dealers/:id/ledger/balance` | Current balance |
| `POST` | `/api/admin/dealers/:id/ledger/payout` | Record manual payout disbursement |
| `POST` | `/api/admin/dealers/:id/ledger/adjustment` | Create adjustment entry |

### Dealer-facing

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dealer/ledger` | Own paginated ledger |
| `GET` | `/api/dealer/ledger/balance` | Own current balance |

## Dependencies

- FEAT-012 — ledger credits are triggered by commission snapshots
- [ADR-001](../decisions/ADR-001-target-region.md) — currency (INR confirmed)
- [ADR-002](../decisions/ADR-002-payout-provider.md) — actual disbursement mechanism (Phase 9); ledger is provider-agnostic

## Notes

The Phase 2 ledger is the foundation. In Phase 9, automated settlement reads the ledger to determine what is owed, calls the payment provider (Stripe Connect or Razorpay Route per ADR-002), and writes a `payout_disbursed` entry when the transfer succeeds. The ledger design does not change.
