import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import type { EntryType, Direction, ReferenceType } from '../lib/constants'

/**
 * Append-only ledger entry for a dealer's commission earnings and payout disbursements.
 *
 * Balance = SUM(amount WHERE direction='credit') − SUM(amount WHERE direction='debit')
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

  @Property({ name: 'created_by', type: 'uuid' })
  createdBy!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
