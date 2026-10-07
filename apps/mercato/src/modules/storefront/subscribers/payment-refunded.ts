import { handleGatewayPaymentEvent, type GatewayPaymentEventPayload } from '../lib/subscriberSupport'

/** Order payment status follows the gateway transaction (`payment_gateways.payment.refunded`). */
export const metadata = {
  event: 'payment_gateways.payment.refunded',
  persistent: true,
  id: 'storefront:payment-refunded',
}

export default async function handle(payload: GatewayPaymentEventPayload): Promise<void> {
  await handleGatewayPaymentEvent('payment_gateways.payment.refunded', payload)
}
