import { createLogger } from '@open-mercato/shared/lib/logger'

const logger = createLogger('dealer_orders').child({ component: 'notify-dealer-on-assignment' })

export const metadata = {
  event: 'dealer_order.assigned',
  persistent: true,
}

export type DealerOrderAssignedPayload = {
  id: string
  orderId: string
  dealerProfileId: string
  tenantId: string
  organizationId: string
  requiredBy: string
  assignedBy: string
}

type ResolverContext = { resolve: <T>(name: string) => T }

/**
 * Sends the dealer an email notification when an order is assigned to them.
 *
 * Full implementation requires FEAT-008 (dealer_profiles with contact email)
 * and FEAT-009 (dealer user/org mapping) to be complete. This subscriber logs
 * the intent and is the integration point — wire the actual email send here
 * once those modules ship their `dealer.contact_email` lookup.
 */
export default async function onDealerOrderAssigned(
  payload: DealerOrderAssignedPayload,
  _ctx: ResolverContext,
): Promise<void> {
  logger.info('dealer_order.assigned — dealer notification queued', {
    assignmentId: payload.id,
    orderId: payload.orderId,
    dealerProfileId: payload.dealerProfileId,
    tenantId: payload.tenantId,
  })
  // TODO(FEAT-008+FEAT-009): resolve dealer contact email from dealer_profiles,
  // look up the dealer portal URL, and send via the notifications service.
}
