import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Typed storefront events.
 * - `storefront.order.placed`: a shopper order was created through the facade
 *   (payload: orderId, orderNumber, checkoutId, customerUserId, tenantId, organizationId).
 * - `storefront.order.payment_synced`: the order's payment state followed a
 *   gateway transaction status change (payload adds transactionId, paymentStatus).
 * - `storefront.customer.linked`: a customer account was linked to a CRM person.
 */
const events = [
  { id: 'storefront.order.placed', label: 'Storefront Order Placed', entity: 'order', category: 'lifecycle' },
  { id: 'storefront.order.payment_synced', label: 'Storefront Order Payment Synced', entity: 'order', category: 'lifecycle' },
  { id: 'storefront.customer.linked', label: 'Storefront Customer Linked to CRM', entity: 'customer', category: 'lifecycle' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'storefront',
  events,
})

export type StorefrontEventId = (typeof events)[number]['id']

export const emitStorefrontEvent = eventsConfig.emit

export default eventsConfig
