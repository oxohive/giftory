import React from 'react'
import { sendEmail } from '@open-mercato/shared/lib/email/send'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { resolveDealerPortalBaseUrl } from './url'

/**
 * Sends real email through the installed `sendEmail` pipeline (the same one
 * core auth's invite/reset emails use) — never a hand-rolled SMTP call. The
 * message always carries a real `<a href>` link, not just body text, so
 * `OM_TEST_MODE`'s capture file records it under `links[]` and a test can
 * assert on the exact URL that was sent, not merely that a function fired.
 */
function linkBody(message: string, href: string, cta: string): React.ReactElement {
  return React.createElement(
    'div',
    null,
    React.createElement('p', null, message),
    React.createElement('a', { href }, cta),
  )
}

export type DealerReviewNotificationInput = {
  to: string
  tenantId: string
  organizationId: string
}

/**
 * Sent when a dealer application is approved. The link always points at the
 * dealer portal's login page — the dealer's secure way to check their own
 * status (`GET .../onboarding/status`) is reached by logging in, never by an
 * unauthenticated token in the email itself.
 */
export async function sendDealerApprovedEmail(input: DealerReviewNotificationInput): Promise<void> {
  const { translate } = await resolveTranslations()
  const loginUrl = `${resolveDealerPortalBaseUrl()}/login`
  const subject = translate('dealer_onboarding.email.approved.subject', 'Your dealer application has been approved')
  const message = translate(
    'dealer_onboarding.email.approved.body',
    'Your dealer application has been approved. Log in to the dealer portal to manage your profile, staff and orders.',
  )
  const cta = translate('dealer_onboarding.email.approved.cta', 'Log in to the dealer portal')
  await sendEmail({
    to: input.to,
    subject,
    react: linkBody(message, loginUrl, cta),
    tenantId: input.tenantId,
    organizationId: input.organizationId,
  })
}

export type DealerRejectionNotificationInput = DealerReviewNotificationInput & { reason: string }

/**
 * Sent when a dealer application is rejected. Includes the reviewer's
 * reason and links to the same login page — once logged in, a rejected
 * dealer can call `GET .../onboarding/status` (to see the reason again) and
 * `POST .../onboarding/resubmit` (to correct and resubmit).
 */
export async function sendDealerRejectedEmail(input: DealerRejectionNotificationInput): Promise<void> {
  const { translate } = await resolveTranslations()
  const loginUrl = `${resolveDealerPortalBaseUrl()}/login`
  const subject = translate('dealer_onboarding.email.rejected.subject', 'Your dealer application needs attention')
  const message = translate(
    'dealer_onboarding.email.rejected.body',
    'Your dealer application was not approved. Reason: {reason}. Log in to review the details and resubmit your application.',
    { reason: input.reason },
  )
  const cta = translate('dealer_onboarding.email.rejected.cta', 'Log in to review and resubmit')
  await sendEmail({
    to: input.to,
    subject,
    react: linkBody(message, loginUrl, cta),
    tenantId: input.tenantId,
    organizationId: input.organizationId,
  })
}
