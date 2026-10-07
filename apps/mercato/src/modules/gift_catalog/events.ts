import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Typed gift_catalog events. IDs follow `<module>.<entity>.<action>`, which is
 * exactly what `emitCrudSideEffects` derives from the `CrudEventsConfig`
 * (`module: 'gift_catalog'`, `entity: 'profile' | 'occasion'`) used by the
 * commands, so these declarations cover every emitted event.
 */
const events = [
  { id: 'gift_catalog.profile.created', label: 'Gift Product Profile Created', entity: 'profile', category: 'crud' },
  { id: 'gift_catalog.profile.updated', label: 'Gift Product Profile Updated', entity: 'profile', category: 'crud' },
  { id: 'gift_catalog.profile.deleted', label: 'Gift Product Profile Deleted', entity: 'profile', category: 'crud' },
  { id: 'gift_catalog.occasion.created', label: 'Gift Occasion Created', entity: 'occasion', category: 'crud' },
  { id: 'gift_catalog.occasion.updated', label: 'Gift Occasion Updated', entity: 'occasion', category: 'crud' },
  { id: 'gift_catalog.occasion.deleted', label: 'Gift Occasion Deleted', entity: 'occasion', category: 'crud' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'gift_catalog',
  events,
})

export type GiftCatalogEventId = (typeof events)[number]['id']

export default eventsConfig
