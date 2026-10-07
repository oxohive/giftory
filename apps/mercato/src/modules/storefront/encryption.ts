import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'

/**
 * At-rest encryption for shopper PII. None of these columns is filtered,
 * sorted or searched, so encrypting them costs no read path. Reads go through
 * `findWithDecryption` / `findOneWithDecryption` with both scope ids.
 */
export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  {
    entityId: 'storefront:storefront_address',
    fields: [
      { field: 'full_name' },
      { field: 'phone' },
      { field: 'line1' },
      { field: 'line2' },
      { field: 'city' },
      { field: 'postal_code' },
    ],
  },
  {
    entityId: 'storefront:storefront_cart_line',
    fields: [{ field: 'gift_message' }],
  },
]

export default defaultEncryptionMaps
