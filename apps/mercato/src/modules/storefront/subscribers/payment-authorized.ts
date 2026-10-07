import { handleGatewayPaymentEvent, type GatewayPaymentEventPayload } from '../lib/subscriberSupport'

/** Order payment status follows the gateway transaction (`payment_gateways.payment.authorized`). */
export const metadata = {
  event: 'payment_gateways.payment.authorized',
  persistent: true,
  id: 'storefront:payment-authorized',
}

export default async function handle(payload: GatewayPaymentEventPayload): Promise<void> {
  await handleGatewayPaymentEvent('payment_gateways.payment.authorized', payload)
}
