import { linkVerifiedCustomer } from '../lib/customerLinkSubscriber'

/** G8: accounts created already verified (staff-created, invitations) get a CRM person right away. */
export const metadata = {
  event: 'customer_accounts.user.created',
  persistent: true,
  id: 'storefront:link-crm-on-user-created',
}

type Payload = { id?: string | null; tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: Payload): Promise<void> {
  if (!payload?.id || !payload.tenantId) return
  await linkVerifiedCustomer({ userId: payload.id, tenantId: payload.tenantId, organizationId: payload.organizationId ?? null })
}
