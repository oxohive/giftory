import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  {
    id: 'commission.rule_created',
    label: 'Commission Rule Created',
    entity: 'commission_rule',
    category: 'lifecycle',
  },
  {
    id: 'commission.rule_deactivated',
    label: 'Commission Rule Deactivated',
    entity: 'commission_rule',
    category: 'lifecycle',
  },
  {
    id: 'commission.snapshot_created',
    label: 'Commission Snapshot Created',
    entity: 'order_commission_snapshot',
    category: 'lifecycle',
  },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'commissions',
  events,
})

export type CommissionEventId = (typeof events)[number]['id']

export default eventsConfig
