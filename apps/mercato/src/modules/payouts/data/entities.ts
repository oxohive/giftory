import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import type { EntryType, Direction, ReferenceType } from '../lib/constants'

/**
 * Append-only ledger entry for a dealer's commission earnings and payout disbursements.
 *
 * Balance = SUM(amount WHERE direction='credit') − SUM(amount WHERE direction='debit')
 * (computed in `lib/balance.ts` — the single source of that formula).
 *
 * Rows are NEVER updated or deleted. Corrections go in as new adjustment entries.
 * All monetary amounts are in INR paise (integer minor units, per CLAUDE.md).
 */
@Entity({ tableName: 'dealer_ledger_entries' })
@Index({ name: 'dle_dealer_idx', properties: ['tenantId', 'dealerProfileId', 'createdAt'] })
@Index({ name: 'dle_reference_idx', properties: ['referenceType', 'referenceId'] })
export class DealerLedgerEntry {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'dealer_profile_id', type: 'uuid' })
  dealerProfileId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** One of: commission_earned, payout_disbursed, adjustment_credit, adjustment_debit */
  @Property({ name: 'entry_type', type: 'text' })
  entryType!: EntryType

  /** Always positive. In INR paise. */
  @Property({ name: 'amount', type: 'numeric', precision: 18, scale: 0 })
  amount!: string

  @Property({ name: 'currency_code', type: 'text', default: 'INR' })
  currencyCode: string = 'INR'

  /** credit = increases balance; debit = decreases balance */
  @Property({ name: 'direction', type: 'text' })
  direction!: Direction

  /** What the referenceId points to */
  @Property({ name: 'reference_type', type: 'text' })
  referenceType!: ReferenceType

  /** ID of the source record (snapshot id, payout record id, etc.) */
  @Property({ name: 'reference_id', type: 'uuid' })
  referenceId!: string

  @Property({ name: 'note', type: 'text', nullable: true })
  note?: string | null

  /**
   * Null for system-triggered entries (e.g. the commission-credit subscriber
   * firing on `commission.snapshot_created`) — there is no real authenticated
   * user to attribute them to. Never stamp a non-UUID sentinel like the
   * literal string "system" here: the column is `uuid` and Postgres rejects
   * it outright (confirmed live — every commission-earned credit silently
   * failed to insert until this was made nullable).
   */
  @Property({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

/**
 * Replay store for the admin ledger write routes (`POST .../ledger/payout`,
 * `POST .../ledger/adjustment`). One row per `Idempotency-Key`, scoped to the
 * caller's tenant + organization — same mechanism as `storefront_checkouts`
 * (unique scoped key + SHA-256 request hash + stored outcome).
 *
 * The row is inserted in the SAME database transaction as the ledger entry it
 * describes, so a key is consumed if and only if the entry was written: a
 * request that fails (validation, insufficient balance, crash) leaves no row
 * and the key can be retried. Rows are never updated.
 */
@Entity({ tableName: 'payouts_idempotency_keys' })
@Unique({ name: 'payouts_idempotency_keys_scope_key_uniq', properties: ['tenantId', 'organizationId', 'idempotencyKey'] })
export class PayoutsIdempotencyKey {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string

  /** `record_payout` | `create_adjustment` */
  @Property({ name: 'operation', type: 'text' })
  operation!: string

  /** SHA-256 of the canonical request (operation + dealer + normalized body). */
  @Property({ name: 'request_hash', type: 'text' })
  requestHash!: string

  /** Scalar id of the ledger entry this request created (no ORM relation). */
  @Property({ name: 'ledger_entry_id', type: 'uuid' })
  ledgerEntryId!: string

  @Property({ name: 'response_status', type: 'int' })
  responseStatus!: number

  /** Exact JSON body returned to the first caller; replayed verbatim. */
  @Property({ name: 'response_body', type: 'json' })
  responseBody!: Record<string, unknown>

  @Property({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
