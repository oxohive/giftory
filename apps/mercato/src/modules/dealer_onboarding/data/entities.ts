import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

/**
 * Dealer-specific profile linked to an OM organization (ADR-003).
 * The `organization_id` column is the scalar FK to `organizations.id` —
 * no ORM relation decorator; cross-module ORM relations are banned.
 * GSTIN and PAN are stored at rest via the module's encryption map.
 */
@Entity({ tableName: 'dealer_profiles' })
@Index({ name: 'dealer_profiles_scope_idx', properties: ['tenantId', 'organizationId', 'deletedAt'] })
@Index({ name: 'dealer_profiles_status_idx', properties: ['tenantId', 'kycStatus'] })
export class DealerProfile {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'business_name', type: 'text' })
  businessName!: string

  @Property({ name: 'contact_email', type: 'text' })
  contactEmail!: string

  @Property({ name: 'phone', type: 'text' })
  phone!: string

  /** Encrypted at rest via dealer_onboarding encryption map. */
  @Property({ name: 'gstin', type: 'text', nullable: true })
  gstin?: string | null

  /** Encrypted at rest via dealer_onboarding encryption map. */
  @Property({ name: 'pan', type: 'text', nullable: true })
  pan?: string | null

  @Property({ name: 'business_type', type: 'text' })
  businessType!: string

  @Property({ name: 'city', type: 'text' })
  city!: string

  @Property({ name: 'state', type: 'text' })
  state!: string

  @Property({ name: 'pincode', type: 'text' })
  pincode!: string

  @Property({ name: 'kyc_status', type: 'text', default: 'pending_verification' })
  kycStatus: string = 'pending_verification'

  @Property({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string | null

  @Property({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string | null

  @Property({ name: 'reviewed_at', type: Date, nullable: true })
  reviewedAt?: Date | null

  @Property({ name: 'approved_at', type: Date, nullable: true })
  approvedAt?: Date | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

/**
 * A single KYC document uploaded by a dealer.
 * `storage_key` is the object-storage key in the private KYC bucket.
 * Signed read URLs are generated on demand by the admin route.
 */
@Entity({ tableName: 'dealer_kyc_documents' })
@Index({ name: 'dealer_kyc_docs_profile_idx', properties: ['dealerProfileId', 'documentType', 'deletedAt'] })
export class DealerKycDocument {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'dealer_profile_id', type: 'uuid' })
  dealerProfileId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'document_type', type: 'text' })
  documentType!: string

  @Property({ name: 'storage_key', type: 'text' })
  storageKey!: string

  @Property({ name: 'file_name', type: 'text' })
  fileName!: string

  @Property({ name: 'file_size_bytes', type: 'integer' })
  fileSizeBytes!: number

  @Property({ name: 'mime_type', type: 'text' })
  mimeType!: string

  @Property({ name: 'uploaded_at', type: Date, onCreate: () => new Date() })
  uploadedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
