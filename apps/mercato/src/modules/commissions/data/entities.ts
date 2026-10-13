import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

/**
 * One commission rate rule, scoped by dealer and optionally by product type.
 *
 * Resolution priority (highest wins):
 *   1. dealer_profile_id + product_type_code  (most specific)
 *   2. dealer_profile_id + null               (dealer default)
 *   3. null + null                            (platform-wide default)
 *
 * `effective_to = null` means the rule is currently active.
 * Rules are never deleted — deactivation sets `effective_to = today`.
 */
@Entity({ tableName: 'commission_rules' })
@Index({ name: 'commission_rules_tenant_idx', properties: ['tenantId', 'effectiveTo'] })
@Index({ name: 'commission_rules_dealer_idx', properties: ['tenantId', 'dealerProfileId', 'productTypeCode', 'effectiveTo'] })
export class CommissionRule {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Null = platform-wide rule. */
  @Property({ name: 'dealer_profile_id', type: 'uuid', nullable: true })
  dealerProfileId?: string | null

  /** Null = applies to all product types for this dealer. */
  @Property({ name: 'product_type_code', type: 'text', nullable: true })
  productTypeCode?: string | null

  /** Rate in basis points (100 bps = 1%). Max 10 000 = 100%. */
  @Property({ name: 'rate_bps', type: 'integer' })
  rateBps!: number

  @Property({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string

  /** Null = currently active. Set to today on deactivation. */
  @Property({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo?: string | null

  @Property({ name: 'created_by', type: 'uuid' })
  createdBy!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

/**
 * Immutable commission snapshot created when an order is assigned to a dealer.
 *
 * Never update a row — append-only by design. The snapshot captures the rate
 * and amount at assignment time so subsequent rule changes do not affect
 * committed orders.
 *
 * All monetary columns are in INR paise (integer minor units, per CLAUDE.md).
 */
@Entity({ tableName: 'order_commission_snapshots' })
@Index({ name: 'ocs_assignment_idx', properties: ['assignmentId'] })
@Index({ name: 'ocs_dealer_idx', properties: ['tenantId', 'dealerProfileId', 'snapshottedAt'] })
@Index({ name: 'ocs_order_idx', properties: ['tenantId', 'orderId'] })
export class OrderCommissionSnapshot {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** FK → dealer_order_assignments.id (scalar, no ORM relation). */
  @Property({ name: 'assignment_id', type: 'uuid' })
  assignmentId!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'dealer_profile_id', type: 'uuid' })
  dealerProfileId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Order subtotal in paise (excludes shipping, platform fees, tax). */
  @Property({ name: 'subtotal_amount', type: 'integer' })
  subtotalAmount!: number

  @Property({ name: 'currency_code', type: 'text', default: 'INR' })
  currencyCode: string = 'INR'

  /** Rate frozen at assignment time (bps). */
  @Property({ name: 'commission_rate_bps', type: 'integer' })
  commissionRateBps!: number

  /** Computed: ROUND(subtotal_amount * commission_rate_bps / 10000). In paise. */
  @Property({ name: 'commission_amount', type: 'integer' })
  commissionAmount!: number

  /** Which rule was applied. Null when no rule found (commission = 0). */
  @Property({ name: 'rule_id', type: 'uuid', nullable: true })
  ruleId?: string | null

  @Property({ name: 'snapshotted_at', type: Date, onCreate: () => new Date() })
  snapshottedAt: Date = new Date()
}
