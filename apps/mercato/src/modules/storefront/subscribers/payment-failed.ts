import { handleGatewayPaymentEvent, type GatewayPaymentEventPayload } from '../lib/subscriberSupport'

/** Order payment status follows the gateway transaction (`payment_gateways.payment.failed`). */
export const metadata = {
  event: 'payment_gateways.payment.failed',
  persistent: true,
  id: 'storefront:payment-failed',
}

export default async function handle(payload: GatewayPaymentEventPayload): Promise<void> {
  await handleGatewayPaymentEvent('payment_gateways.payment.failed', payload)
}
