import { linkVerifiedCustomer } from '../lib/customerLinkSubscriber'

/** G8: a self-service sign-up is linked to a CRM person once its e-mail is verified. */
export const metadata = {
  event: 'customer_accounts.email.verified',
  persistent: true,
  id: 'storefront:link-crm-on-email-verified',
}

type Payload = { userId?: string | null; tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: Payload): Promise<void> {
  if (!payload?.userId || !payload.tenantId) return
  await linkVerifiedCustomer({ userId: payload.userId, tenantId: payload.tenantId, organizationId: payload.organizationId ?? null })
}
