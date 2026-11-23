import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { TenantDataEncryptionService } from '@open-mercato/shared/lib/encryption/tenantDataEncryptionService'
import { DealerKycDocument, DealerProfile } from '../data/entities'

export type ApplicationForReview = {
  profile: DealerProfile
  documents: DealerKycDocument[]
}

/**
 * Loads one dealer application (DealerProfile + its live KYC documents) for
 * the admin review detail screen, with GSTIN/PAN decrypted.
 *
 * Trust boundary: tenant-only, exactly like the other admin review routes —
 * `tenantId` MUST come from the reviewer's session. The application id comes
 * from the URL path and is only ever used together with that tenant filter.
 *
 * Decryption scope (known gap 5): the encryption-map lookup used when a
 * DealerProfile is WRITTEN (register / resubmit via the ORM subscriber) is the
 * row's own `(tenant_id, organization_id)` — i.e. the DEALER's organization —
 * and the data-encryption key itself is per tenant. The read MUST therefore
 * use the same pair. `findOneWithDecryption` does exactly that for any row
 * that carries its own `tenantId`/`organizationId` columns (which
 * DealerProfile always does — both are NOT NULL); the fifth-argument scope is
 * only a FALLBACK for rows without scope columns. We pass the trusted tenant
 * and NO organization: never the application/profile id (the previous code
 * passed the profile id as the "organization", and also had the arguments
 * shifted by one — it passed the DI container as the entity class), and never
 * the reviewer's own organization, which is not the scope the row was written
 * under.
 */
export async function findApplicationForReview(
  em: EntityManager,
  tenantId: string,
  applicationId: string,
  options: { encryptionService?: TenantDataEncryptionService | null } = {},
): Promise<ApplicationForReview | null> {
  const profile = await findOneWithDecryption<DealerProfile>(
    em,
    DealerProfile,
    { id: applicationId, tenantId, deletedAt: null } as FilterQuery<DealerProfile>,
    undefined,
    { tenantId, organizationId: null, encryptionService: options.encryptionService ?? null },
  )
  if (!profile) return null

  const documents = await em.find(DealerKycDocument, {
    dealerProfileId: profile.id,
    tenantId,
    deletedAt: null,
  } as FilterQuery<DealerKycDocument>)

  return { profile, documents }
}
