import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  {
    id: 'payouts.ledger_entry_created',
    label: 'Dealer Ledger Entry Created',
    entity: 'dealer_ledger_entry',
    category: 'lifecycle',
  },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'payouts',
  events,
})

export type PayoutsEventId = (typeof events)[number]['id']

export default eventsConfig
