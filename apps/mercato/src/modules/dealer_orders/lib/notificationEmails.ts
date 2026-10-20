import React from 'react'
import { sendEmail } from '@open-mercato/shared/lib/email/send'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { resolveDealerPortalBaseUrl } from './url'

function linkBody(message: string, href: string, cta: string): React.ReactElement {
  return React.createElement(
    'div',
    null,
    React.createElement('p', null, message),
    React.createElement('a', { href }, cta),
  )
}

export type DealerOrderAssignedNotificationInput = {
  to: string
  tenantId: string
  organizationId: string
  assignmentId: string
  requiredBy: string
}

/**
 * Sent when an order is assigned to a dealer (FEAT-011/US-005 #4: "the
 * dealer receives an email notification"). Links to the dealer portal's
 * order-detail route keyed by ASSIGNMENT id — never the sales order id, per
 * the assignment-id-vs-order-id contract documented in
 * `commands/assignments.ts`.
 */
export async function sendDealerOrderAssignedEmail(input: DealerOrderAssignedNotificationInput): Promise<void> {
  const { translate } = await resolveTranslations()
  const orderUrl = `${resolveDealerPortalBaseUrl()}/orders/${input.assignmentId}`
  const subject = translate('dealer_orders.email.assigned.subject', 'You have a new order to fulfil')
  const message = translate(
    'dealer_orders.email.assigned.body',
    'A new order has been assigned to you. Production is required by {requiredBy}.',
    { requiredBy: input.requiredBy },
  )
  const cta = translate('dealer_orders.email.assigned.cta', 'View order')
  await sendEmail({
    to: input.to,
    subject,
    react: linkBody(message, orderUrl, cta),
    tenantId: input.tenantId,
    organizationId: input.organizationId,
  })
}
