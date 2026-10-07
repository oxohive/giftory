import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'gift_catalog',
  title: 'Gift Catalog',
  version: '0.1.0',
  description:
    'Extends the native catalog with gift metadata (occasions, recipients, personalization, fulfillment) and an occasion lookup for storefront navigation.',
  author: 'Gift Marketplace',
  license: 'Proprietary',
  requires: ['catalog'],
}
