import type { IntegrationCredentialWebhookHelp } from '@open-mercato/shared/modules/integrations/types'
import { RAZORPAY_WEBHOOK_EVENTS } from './lib/status-map'

export const RAZORPAY_WEBHOOK_ENDPOINT_PATH = '/api/payment_gateways/webhook/razorpay'

export const razorpayWebhookSetupGuide: IntegrationCredentialWebhookHelp = {
  kind: 'webhook_setup',
  title: 'Razorpay webhook configuration',
  summary: 'Configure a Razorpay webhook so authorizations, captures, failed attempts, paid orders, and refunds stay synchronized with Open Mercato.',
  endpointPath: RAZORPAY_WEBHOOK_ENDPOINT_PATH,
  dashboardPathLabel: 'Razorpay Dashboard -> Account & Settings -> Webhooks',
  steps: [
    'Switch the Razorpay Dashboard to the same mode (Test or Live) as the API keys configured here.',
    'Open Account & Settings -> Webhooks and click Add New Webhook.',
    'Set the Webhook URL to your public Open Mercato URL plus /api/payment_gateways/webhook/razorpay.',
    'Enter a strong random Secret, then select the events listed below.',
    'Paste the same Secret into the Webhook Secret field in Integrations and save the Razorpay credentials.',
    'Make a test payment and confirm the transaction status updates.',
  ],
  events: [...RAZORPAY_WEBHOOK_EVENTS],
  localDevelopment: {
    note: 'Razorpay only delivers to public HTTPS URLs. For local development, expose the app through a tunnel and use that URL in the Razorpay Dashboard (Test mode).',
    tunnelCommand: 'ngrok http 3000',
    publicUrlExample: 'https://<your-subdomain>.ngrok-free.app/api/payment_gateways/webhook/razorpay',
  },
}
