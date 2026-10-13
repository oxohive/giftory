import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dealer_orders',
  title: 'Dealer Order Assignments',
  version: '0.1.0',
  description:
    'Manual order assignment: assigns paid orders to approved dealers, tracks production status, and emits the dealer_order.assigned event consumed by the commission engine.',
  author: 'Gift Marketplace',
  license: 'Proprietary',
  requires: ['sales'],
}
