import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'

/** At-rest encryption for sensitive dealer PII (GSTIN, PAN). */
export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  {
    entityId: 'dealer_onboarding:dealer_profiles',
    fields: [{ field: 'gstin' }, { field: 'pan' }],
  },
]

export default defaultEncryptionMaps
