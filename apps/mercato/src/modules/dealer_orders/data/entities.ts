import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import type { AssignmentStatus } from '../lib/constants'

/**
 * Records one dealer assignment for an order.
 *
 * An order may have at most one non-cancelled assignment at any time.
 * Reassignment cancels the previous record and creates a new one, so the
 * full history is always queryable by filtering `cancelled_reason IS NOT NULL`.
 *
 * Cross-module rules: `order_id` is a scalar FK to the native `sales` orders
 * table; `dealer_profile_id` is a scalar FK to `dealer_profiles` (FEAT-008).
 * ORM relations across module boundaries are forbidden — use IDs only.
 */
@Entity({ tableName: 'dealer_order_assignments' })
@Index({ name: 'doa_scope_idx', properties: ['tenantId', 'organizationId', 'deletedAt'] })
@Index({ name: 'doa_order_idx', properties: ['tenantId', 'orderId', 'deletedAt'] })
@Index({ name: 'doa_dealer_idx', properties: ['tenantId', 'dealerProfileId', 'deletedAt'] })
export class DealerOrderAssignment {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'dealer_profile_id', type: 'uuid' })
  dealerProfileId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Dealer's organization — denormalized from dealer_profiles at assignment time. */
  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'assigned_by', type: 'uuid' })
  assignedBy!: string

  @Property({ name: 'assigned_at', type: Date })
  assignedAt: Date = new Date()

  /** Production deadline set by the admin at assignment time. */
  @Property({ name: 'required_by', type: 'date' })
  requiredBy!: string

  @Property({ name: 'status', type: 'text' })
  status: AssignmentStatus = 'assigned'

  @Property({ name: 'status_updated_at', type: Date })
  statusUpdatedAt: Date = new Date()

  @Property({ name: 'status_note', type: 'text', nullable: true })
  statusNote?: string | null

  @Property({ name: 'cancelled_reason', type: 'text', nullable: true })
  cancelledReason?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

/**
 * Replay store for `Idempotency-Key` on the admin assignment writes
 * (`POST`/`PUT /admin/orders/{id}/assignment`). One row per key, scoped to the
 * caller's tenant + organization — the same mechanism as `storefront_checkouts`
 * (unique scoped key + SHA-256 request hash + claim, then stored outcome).
 *
 * Lifecycle: inserted as `processing` before the command runs (the claim);
 * set to `completed` with the response once it succeeds; deleted if the
 * command fails, so a failed attempt never consumes the key. A `processing`
 * claim older than the stale window (crashed request) can be taken over by a
 * retry with the same payload. See `lib/idempotency.ts`.
 */
@Entity({ tableName: 'dealer_order_idempotency_keys' })
@Unique({ name: 'dealer_order_idempotency_keys_scope_key_uniq', properties: ['tenantId', 'organizationId', 'idempotencyKey'] })
export class DealerOrderIdempotencyKey {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string

  /** `assign` | `reassign` */
  @Property({ name: 'operation', type: 'text' })
  operation!: string

  /** SHA-256 of the canonical request (operation + order + normalized body). */
  @Property({ name: 'request_hash', type: 'text' })
  requestHash!: string

  /** `processing` | `completed` */
  @Property({ name: 'status', type: 'text' })
  status: string = 'processing'

  @Property({ name: 'claimed_at', type: Date })
  claimedAt: Date = new Date()

  @Property({ name: 'response_status', type: 'int', nullable: true })
  responseStatus?: number | null

  /** Exact JSON body returned to the first caller; replayed verbatim. */
  @Property({ name: 'response_body', type: 'json', nullable: true })
  responseBody?: Record<string, unknown> | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
