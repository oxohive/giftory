import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { CustomerUser } from '@open-mercato/core/modules/customer_accounts/data/entities'
import { ensureCustomerPerson } from './customerLink'

const logger = createLogger('storefront').child({ component: 'customer-link-subscriber' })

/**
 * Link a customer account to a CRM person once its e-mail is verified.
 * Unverified sign-ups are skipped so unconfirmed (possibly mistyped or
 * malicious) addresses never create CRM records; first order placement links
 * them anyway.
 */
export async function linkVerifiedCustomer(input: { userId: string; tenantId: string; organizationId?: string | null }): Promise<void> {
  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  const user = await findOneWithDecryption(
    em,
    CustomerUser,
    {
      id: input.userId,
      tenantId: input.tenantId,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      deletedAt: null,
    } as FilterQuery<CustomerUser>,
    undefined,
    { tenantId: input.tenantId, organizationId: input.organizationId ?? null },
  )
  if (!user || !user.emailVerifiedAt || !user.organizationId) return
  try {
    await ensureCustomerPerson(
      container,
      { tenantId: input.tenantId, organizationId: String(user.organizationId) },
      { customerUserId: String(user.id), email: user.email ?? null, displayName: user.displayName ?? null },
    )
  } catch (err) {
    logger.error('Failed to link customer account to CRM person', { userId: input.userId, err })
    throw err
  }
}
