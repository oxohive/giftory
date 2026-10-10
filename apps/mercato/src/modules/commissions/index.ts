import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'commissions',
  title: 'Commission Engine',
  version: '0.1.0',
  description:
    'Configurable commission rules and immutable per-assignment commission snapshots. Triggered by dealer_order.assigned; all amounts stored in INR paise.',
  author: 'Gift Marketplace',
  license: 'Proprietary',
  requires: ['sales'],
}
