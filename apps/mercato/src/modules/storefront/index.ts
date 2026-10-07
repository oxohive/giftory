import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'storefront',
  title: 'Storefront Commerce API',
  version: '0.1.0',
  description:
    'Shopper-facing commerce facade: public catalog reads, server-side cart, checkout through native sales orders and payment gateways, CRM customer linking, address book and order history.',
  author: 'Gift Marketplace',
  license: 'Proprietary',
  requires: ['catalog', 'sales', 'customers', 'customer_accounts', 'payment_gateways', 'gift_catalog'],
}
