import { buildIntegrationDetailWidgetSpotId, type IntegrationBundle, type IntegrationDefinition } from '@open-mercato/shared/modules/integrations/types'
import { razorpayWebhookSetupGuide } from './webhook-guide'

export const gatewayRazorpayDetailWidgetSpotId = buildIntegrationDetailWidgetSpotId('gateway_razorpay')

export const integration: IntegrationDefinition = {
  id: 'gateway_razorpay',
  title: 'Razorpay',
  description: 'Accept UPI, cards, netbanking, and wallets in India via Razorpay Checkout.',
  category: 'payment',
  hub: 'payment_gateways',
  providerKey: 'razorpay',
  icon: 'razorpay',
  docsUrl: 'https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/',
  version: '1.0.0',
  author: 'Gift App',
  license: 'Proprietary',
  tags: ['upi', 'cards', 'netbanking', 'wallets', 'india', 'inr', 'checkout'],
  detailPage: {
    widgetSpotId: gatewayRazorpayDetailWidgetSpotId,
  },
  credentials: {
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        required: true,
        options: [
          { value: 'test', label: 'Test' },
          { value: 'live', label: 'Live' },
        ],
        helpText: 'Must match the Key ID prefix: rzp_test_ for Test, rzp_live_ for Live.',
      },
      {
        key: 'keyId',
        label: 'Key ID',
        type: 'text',
        required: true,
        placeholder: 'rzp_test_...',
        helpText: 'Razorpay Dashboard -> Account & Settings -> API Keys. The Key ID is public and is sent to the browser to open Checkout.',
      },
      {
        key: 'keySecret',
        label: 'Key Secret',
        type: 'secret',
        required: true,
        helpText: 'Shown only once when the key is generated. Regenerate it in the Razorpay Dashboard if lost.',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        type: 'secret',
        required: true,
        helpText: 'The secret you entered when creating the Razorpay webhook. It is different from the Key Secret.',
        helpDetails: razorpayWebhookSetupGuide,
      },
    ],
  },
  healthCheck: { service: 'razorpayHealthCheck' },
}

export const integrations: IntegrationDefinition[] = [integration]
export const bundles: IntegrationBundle[] = []
export const bundle: IntegrationBundle | undefined = undefined
