import { asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import {
  registerGatewayAdapter,
  registerPaymentGatewayDescriptor,
  registerWebhookHandler,
} from '@open-mercato/shared/modules/payment_gateways/types'
import { razorpayAdapter, RAZORPAY_CHECKOUT_RENDERER_KEY } from './lib/adapter'
import { razorpayHealthCheck } from './lib/health'
import { RAZORPAY_PROVIDER_KEY } from './lib/credentials'
import { RAZORPAY_SUPPORTED_CURRENCIES } from './lib/money'
import { readRazorpaySessionIdHint, verifyRazorpayWebhook } from './lib/webhook-handler'
import { RAZORPAY_WEBHOOK_QUEUE } from './lib/queue'

/** Razorpay webhook bodies are small JSON documents; cap well below the host default. */
const RAZORPAY_WEBHOOK_MAX_BODY_BYTES = 256 * 1024

const RAZORPAY_PAYMENT_TYPES = [
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Cards' },
  { value: 'netbanking', label: 'Netbanking' },
  { value: 'wallet', label: 'Wallets' },
]

export function register(container: AppContainer) {
  registerGatewayAdapter(razorpayAdapter)
  registerWebhookHandler(RAZORPAY_PROVIDER_KEY, (input) => verifyRazorpayWebhook(input), {
    queue: RAZORPAY_WEBHOOK_QUEUE,
    readSessionIdHint: readRazorpaySessionIdHint,
    maxBodyBytes: RAZORPAY_WEBHOOK_MAX_BODY_BYTES,
  })
  registerPaymentGatewayDescriptor({
    providerKey: RAZORPAY_PROVIDER_KEY,
    label: 'Razorpay',
    sessionConfig: {
      fields: [
        {
          key: 'captureMethod',
          label: 'Capture method',
          type: 'select',
          required: false,
          options: [
            { value: 'automatic', label: 'Automatic capture' },
            { value: 'manual', label: 'Manual capture' },
          ],
        },
      ],
      supportedCurrencies: [...RAZORPAY_SUPPORTED_CURRENCIES],
      supportedPaymentTypes: RAZORPAY_PAYMENT_TYPES,
      defaultRendererKey: RAZORPAY_CHECKOUT_RENDERER_KEY,
      renderers: [
        {
          key: RAZORPAY_CHECKOUT_RENDERER_KEY,
          label: 'Razorpay Checkout',
          type: 'embedded',
          description: 'Opens the Razorpay Checkout modal on the merchant page (UPI, cards, netbanking, wallets).',
          supportedPaymentTypes: RAZORPAY_PAYMENT_TYPES.map((type) => type.value),
        },
      ],
    },
  })

  container.register({
    razorpayHealthCheck: asValue(razorpayHealthCheck),
  })
}
