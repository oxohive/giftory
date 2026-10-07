import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { syncCheckoutPayment } from './paymentSync'

const logger = createLogger('storefront').child({ component: 'payment-subscriber' })

/** Payload of `payment_gateways.payment.*` events (gateway-service `emitStatusEvent`). */
export type GatewayPaymentEventPayload = {
  transactionId?: string | null
  paymentId?: string | null
  providerKey?: string | null
  organizationId?: string | null
  tenantId?: string | null
}

/**
 * Shared handler for the gateway payment subscribers. Persistent subscribers
 * are retried on failure, so errors are logged and rethrown; the sync itself
 * is idempotent.
 */
export async function handleGatewayPaymentEvent(event: string, payload: GatewayPaymentEventPayload): Promise<void> {
  if (!payload?.transactionId || !payload.organizationId || !payload.tenantId) return
  const container = await createRequestContainer()
  try {
    await syncCheckoutPayment(container, {
      transactionId: payload.transactionId,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
    })
  } catch (err) {
    logger.error('Failed to sync storefront order payment', { event, transactionId: payload.transactionId, err })
    throw err
  }
}
