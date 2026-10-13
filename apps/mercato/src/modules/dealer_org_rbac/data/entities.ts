import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

/**
 * Production capabilities declared by an approved dealer.
 * One row per dealer profile (upsert pattern via DEALER_CAPABILITIES_UPSERT_COMMAND).
 * Used by the manual assignment UI (Phase 2) and the automated matching scorer (Phase 5).
 */
@Entity({ tableName: 'dealer_capabilities' })
@Index({ name: 'dealer_cap_profile_idx', properties: ['dealerProfileId', 'tenantId', 'deletedAt'] })
export class DealerCapability {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'dealer_profile_id', type: 'uuid' })
  dealerProfileId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** e.g. ['mug', 'tshirt', 'photo_frame'] */
  @Property({ name: 'product_type_codes', type: 'array' })
  productTypeCodes: string[] = []

  /** e.g. ['sublimation', 'dtg', 'laser_engraving'] */
  @Property({ name: 'printing_methods', type: 'array' })
  printingMethods: string[] = []

  /** Units per day across all order types. */
  @Property({ name: 'max_daily_capacity', type: 'integer' })
  maxDailyCapacity: number = 0

  /** ISO 3166-2:IN state codes, e.g. ['IN-MH', 'IN-KA']. */
  @Property({ name: 'serviceable_states', type: 'array' })
  serviceableStates: string[] = []

  @Property({ name: 'min_order_qty', type: 'integer', default: 1 })
  minOrderQty: number = 1

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
