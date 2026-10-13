import { createLogger } from '@open-mercato/shared/lib/logger'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { sendDealerOrderAssignedEmail } from '../lib/notificationEmails'

const logger = createLogger('dealer_orders').child({ component: 'notify-dealer-on-assignment' })

export const metadata = {
  event: 'dealer_order.assigned',
  persistent: true,
  id: 'dealer_orders-notify-assignment',
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
 * Sends the dealer an email notification when an order is assigned to them
 * (FEAT-011/US-005 #4). Resolves the dealer's contact email from
 * `dealer_onboarding`'s `DealerProfile` by scalar id — a cross-module scalar
 * read, never an ORM relation, mirroring the existing precedent in
 * `commands/shared.ts`'s `resolveOwnDealerProfileId`.
 */
export default async function onDealerOrderAssigned(
  payload: DealerOrderAssignedPayload,
  _ctx: ResolverContext,
): Promise<void> {
  // Subscribers may run outside an inbound request (worker/queue process), so
  // resolve a fresh DI container here rather than trusting `_ctx` to carry
  // one — mirrors the existing precedent in
  // `payouts/subscribers/credit-on-snapshot.ts`.
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em')
  const { DealerProfile } = await import('@/modules/dealer_onboarding/data/entities')
  const profile = await em.findOne(DealerProfile, {
    id: payload.dealerProfileId,
    tenantId: payload.tenantId,
    deletedAt: null,
  } as FilterQuery<InstanceType<typeof DealerProfile>>)

  if (!profile) {
    // The dealer profile was deleted/moved between assignment and delivery —
    // log and drop rather than throwing (no mailbox exists to notify).
    logger.warn('dealer_order.assigned — dealer profile not found, skipping notification', {
      assignmentId: payload.id,
      dealerProfileId: payload.dealerProfileId,
      tenantId: payload.tenantId,
    })
    return
  }

  await sendDealerOrderAssignedEmail({
    to: profile.contactEmail,
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    assignmentId: payload.id,
    requiredBy: payload.requiredBy,
  })

  logger.info('dealer_order.assigned — dealer notification sent', {
    assignmentId: payload.id,
    orderId: payload.orderId,
    dealerProfileId: payload.dealerProfileId,
    tenantId: payload.tenantId,
  })
}
