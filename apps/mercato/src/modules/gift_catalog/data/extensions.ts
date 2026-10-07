import type { EntityExtension } from '@open-mercato/shared/modules/entities'

/**
 * Declares the scalar link between a catalog product and its gift profile.
 * There is deliberately no ORM relation (cross-module relations are banned);
 * `gift_product_profiles.product_id` holds the catalog product id, scoped by the
 * same tenant/organization, with at most one profile per product.
 */
const entityExtensions: EntityExtension[] = [
  {
    base: 'catalog:catalog_product',
    extension: 'gift_catalog:gift_product_profile',
    join: { baseKey: 'id', extensionKey: 'product_id' },
    table: 'gift_product_profiles',
    cardinality: 'one-to-one',
    description: 'Gift metadata (occasions, recipients, personalization, fulfillment) for a catalog product',
  },
]

export const extensions = entityExtensions
export default entityExtensions
