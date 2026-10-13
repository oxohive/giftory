import { createLogger } from '@open-mercato/shared/lib/logger'
import { sendDealerApprovedEmail } from '../lib/notificationEmails'

const logger = createLogger('dealer_onboarding').child({ component: 'notify-dealer-on-approval' })

export const metadata = {
  event: 'dealer_onboarding.profile.approved',
  persistent: true,
  id: 'dealer_onboarding-notify-approval',
}

export type DealerProfileApprovedPayload = {
  id: string
  tenantId: string
  organizationId: string
  contactEmail: string
}

type ResolverContext = { resolve: <T>(name: string) => T }

/**
 * Sends the dealer owner a real email (via the shared `sendEmail` pipeline —
 * same transport/test-capture mechanism as core auth's own invite/reset
 * emails) telling them their application was approved and linking to the
 * dealer portal login page.
 */
export default async function onDealerProfileApproved(
  payload: DealerProfileApprovedPayload,
  _ctx: ResolverContext,
): Promise<void> {
  await sendDealerApprovedEmail({
    to: payload.contactEmail,
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
  })
  logger.info('dealer_onboarding.profile.approved — approval email sent', {
    dealerProfileId: payload.id,
    tenantId: payload.tenantId,
  })
}
