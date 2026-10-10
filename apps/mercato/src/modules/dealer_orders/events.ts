import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  {
    id: 'dealer_order.assigned',
    label: 'Dealer Order Assigned',
    entity: 'assignment',
    category: 'lifecycle',
  },
  {
    id: 'dealer_order.reassigned',
    label: 'Dealer Order Reassigned',
    entity: 'assignment',
    category: 'lifecycle',
  },
  {
    id: 'dealer_order.cancelled',
    label: 'Dealer Order Assignment Cancelled',
    entity: 'assignment',
    category: 'lifecycle',
  },
  {
    id: 'dealer_order.status_updated',
    label: 'Dealer Order Status Updated',
    entity: 'assignment',
    category: 'lifecycle',
  },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'dealer_orders',
  events,
})

export type DealerOrderEventId = (typeof events)[number]['id']

export default eventsConfig
