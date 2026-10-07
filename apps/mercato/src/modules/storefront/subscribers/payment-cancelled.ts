import { handleGatewayPaymentEvent, type GatewayPaymentEventPayload } from '../lib/subscriberSupport'

/** Order payment status follows the gateway transaction (`payment_gateways.payment.cancelled`). */
export const metadata = {
  event: 'payment_gateways.payment.cancelled',
  persistent: true,
  id: 'storefront:payment-cancelled',
}

export default async function handle(payload: GatewayPaymentEventPayload): Promise<void> {
  await handleGatewayPaymentEvent('payment_gateways.payment.cancelled', payload)
}
