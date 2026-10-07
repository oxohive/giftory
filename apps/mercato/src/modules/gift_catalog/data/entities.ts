import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import type { GiftFulfillmentMode } from '../lib/constants'

/**
 * Gift-specific metadata for one native catalog product.
 *
 * Linked to `catalog:catalog_product` by the scalar `product_id` column only —
 * cross-module ORM relations are banned, and the link is declared in
 * `data/extensions.ts`. Exactly one live profile per product per organization:
 * the composite unique constraint covers soft-deleted rows too, so the create
 * command revives a soft-deleted profile instead of inserting a duplicate.
 */
@Entity({ tableName: 'gift_product_profiles' })
@Unique({
  name: 'gift_product_profiles_scope_product_uniq',
  properties: ['tenantId', 'organizationId', 'productId'],
})
@Index({ name: 'gift_product_profiles_scope_idx', properties: ['tenantId', 'organizationId', 'deletedAt'] })
export class GiftProductProfile {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'occasions', type: 'text[]', defaultRaw: `'{}'` })
  occasions: string[] = []

  @Property({ name: 'recipient_types', type: 'text[]', defaultRaw: `'{}'` })
  recipientTypes: string[] = []

  @Property({ name: 'is_customizable', type: 'boolean', default: false })
  isCustomizable: boolean = false

  @Property({ name: 'proof_required', type: 'boolean', default: false })
  proofRequired: boolean = false

  @Property({ name: 'gift_wrap_available', type: 'boolean', default: false })
  giftWrapAvailable: boolean = false

  @Property({ name: 'gift_message_max_length', type: 'integer', default: 250 })
  giftMessageMaxLength: number = 250

  @Property({ name: 'production_lead_time_days', type: 'integer', nullable: true })
  productionLeadTimeDays?: number | null

  @Property({ name: 'personalization_notes', type: 'text', nullable: true })
  personalizationNotes?: string | null

  /** `platform` | `dealer` — see `GIFT_FULFILLMENT_MODES`. */
  @Property({ name: 'fulfillment_mode', type: 'text', default: 'dealer' })
  fulfillmentMode: GiftFulfillmentMode = 'dealer'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

/**
 * Organization-scoped occasion lookup used by storefront navigation
 * (e.g. "Shop by occasion"). `code` matches the occasion vocabulary stored on
 * `GiftProductProfile.occasions`.
 */
@Entity({ tableName: 'gift_occasions' })
@Unique({
  name: 'gift_occasions_scope_code_uniq',
  properties: ['tenantId', 'organizationId', 'code'],
})
@Index({ name: 'gift_occasions_scope_idx', properties: ['tenantId', 'organizationId', 'deletedAt'] })
export class GiftOccasion {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text' })
  label!: string

  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number = 0

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'image_url', type: 'text', nullable: true })
  imageUrl?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
