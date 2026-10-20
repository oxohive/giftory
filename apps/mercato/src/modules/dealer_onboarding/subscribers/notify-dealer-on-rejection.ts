import { createLogger } from '@open-mercato/shared/lib/logger'
import { sendDealerRejectedEmail } from '../lib/notificationEmails'

const logger = createLogger('dealer_onboarding').child({ component: 'notify-dealer-on-rejection' })

export const metadata = {
  event: 'dealer_onboarding.profile.rejected',
  persistent: true,
  id: 'dealer_onboarding-notify-rejection',
}

export type DealerProfileRejectedPayload = {
  id: string
  tenantId: string
  organizationId: string
  contactEmail: string
  reason: string
}

type ResolverContext = { resolve: <T>(name: string) => T }

/**
 * Sends the dealer owner a real email with the rejection reason and a link
 * to log in and resubmit — see `lib/notificationEmails.ts`.
 */
export default async function onDealerProfileRejected(
  payload: DealerProfileRejectedPayload,
  _ctx: ResolverContext,
): Promise<void> {
  await sendDealerRejectedEmail({
    to: payload.contactEmail,
    reason: payload.reason,
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
  })
  logger.info('dealer_onboarding.profile.rejected — rejection email sent', {
    dealerProfileId: payload.id,
    tenantId: payload.tenantId,
  })
}
