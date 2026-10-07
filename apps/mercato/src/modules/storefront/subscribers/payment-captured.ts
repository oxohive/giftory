import { handleGatewayPaymentEvent, type GatewayPaymentEventPayload } from '../lib/subscriberSupport'

/** Order payment status follows the gateway transaction (`payment_gateways.payment.captured`). */
export const metadata = {
  event: 'payment_gateways.payment.captured',
  persistent: true,
  id: 'storefront:payment-captured',
}

export default async function handle(payload: GatewayPaymentEventPayload): Promise<void> {
  await handleGatewayPaymentEvent('payment_gateways.payment.captured', payload)
}
