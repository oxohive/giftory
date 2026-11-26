import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { DEALER_PROFILE_ENTITY_ID } from './lib/constants'

/**
 * At-rest encryption for sensitive dealer PII (GSTIN, PAN).
 *
 * `entityId` MUST equal the id the generator registers for `DealerProfile`
 * (`.mercato/generated/entities.ids.generated.ts` → `dealer_onboarding:dealer_profile`,
 * singular). The tenant-encryption ORM subscriber resolves the id from the
 * entity's metadata and looks up `encryption_maps.entity_id` by exact match,
 * so a mismatched id (this file previously declared `dealer_profiles`,
 * plural) means the map can never be found and GSTIN/PAN are written as
 * plaintext.
 *
 * This declaration only feeds map SEEDING (tenant setup /
 * `mercato entities seed-encryption`). Runtime encryption also needs an active
 * `encryption_maps` row for this entity id whose (tenant_id, organization_id)
 * matches the dealer row's OWN scope — or a tenant-wide row
 * (organization_id NULL), because every dealer gets its own organization.
 * See tasks/milestone-1/WS-B-kyc-security.md for the activation steps.
 */
export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  {
    entityId: DEALER_PROFILE_ENTITY_ID,
    fields: [{ field: 'gstin' }, { field: 'pan' }],
  },
]

export default defaultEncryptionMaps
