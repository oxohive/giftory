"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  registerEmbeddedPaymentGatewayRenderer,
  type EmbeddedPaymentGatewayRendererProps,
} from '@open-mercato/shared/modules/payment_gateways/client'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

const RAZORPAY_CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'
const CONFIRM_ENDPOINT = '/api/gateway_razorpay/confirm'

type RazorpaySuccessResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

type RazorpayFailureResponse = {
  error?: { description?: string }
}

type RazorpayCheckoutInstance = {
  open: () => void
  on: (event: 'payment.failed', handler: (response: RazorpayFailureResponse) => void) => void
}

type RazorpayCheckoutConstructor = new (options: Record<string, unknown>) => RazorpayCheckoutInstance

type RazorpayPayload = {
  keyId?: string
  orderId?: string
  amount?: number
  currency?: string
  description?: string
  returnUrl?: string
}

function readPayload(payload: Record<string, unknown> | undefined): RazorpayPayload {
  return {
    keyId: typeof payload?.keyId === 'string' ? payload.keyId : undefined,
    orderId: typeof payload?.orderId === 'string' ? payload.orderId : undefined,
    amount: typeof payload?.amount === 'number' ? payload.amount : undefined,
    currency: typeof payload?.currency === 'string' ? payload.currency : undefined,
    description: typeof payload?.description === 'string' ? payload.description : undefined,
    returnUrl: typeof payload?.returnUrl === 'string' ? payload.returnUrl : undefined,
  }
}

let scriptPromise: Promise<RazorpayCheckoutConstructor> | null = null

/** Loads Checkout.js once, only when the renderer is actually shown. */
function loadRazorpayCheckout(): Promise<RazorpayCheckoutConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayCheckoutConstructor }).Razorpay
  if (existing) return Promise.resolve(existing)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = RAZORPAY_CHECKOUT_SCRIPT_URL
    script.async = true
    script.onload = () => {
      const loaded = (window as unknown as { Razorpay?: RazorpayCheckoutConstructor }).Razorpay
      if (loaded) resolve(loaded)
      else reject(new Error('Razorpay Checkout did not initialize'))
    }
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Razorpay Checkout could not be loaded'))
    }
    document.body.appendChild(script)
  })
  return scriptPromise
}

function RazorpayCheckoutRenderer(props: EmbeddedPaymentGatewayRendererProps) {
  const t = useT()
  const payload = React.useMemo(() => readPayload(props.session.payload), [props.session.payload])
  const { onComplete, onError } = props
  const [isBusy, setIsBusy] = React.useState(false)
  const ready = Boolean(payload.keyId && payload.orderId && payload.amount && payload.currency)

  React.useEffect(() => {
    if (!ready) {
      onError(t('gateway_razorpay.payments.unavailable', 'Razorpay checkout could not be prepared for this payment.'))
    }
  }, [onError, ready, t])

  const confirm = React.useCallback(async (response: RazorpaySuccessResponse) => {
    const result = await apiCall<{ status?: string }>(CONFIRM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      }),
    })
    if (!result.ok) {
      onError(t('gateway_razorpay.payments.verificationFailed', 'We could not verify this payment. If you were charged, it will be reconciled automatically.'))
      return
    }
    onComplete()
  }, [onComplete, onError, t])

  const openCheckout = React.useCallback(async () => {
    if (!ready) return
    setIsBusy(true)
    onError('')
    try {
      const Razorpay = await loadRazorpayCheckout()
      const checkout = new Razorpay({
        key: payload.keyId,
        order_id: payload.orderId,
        amount: payload.amount,
        currency: payload.currency,
        description: payload.description,
        handler: (response: RazorpaySuccessResponse) => {
          void confirm(response).finally(() => setIsBusy(false))
        },
        modal: {
          ondismiss: () => {
            setIsBusy(false)
            onError(t('gateway_razorpay.payments.dismissed', 'Payment was not completed. You can try again.'))
          },
        },
      })
      checkout.on('payment.failed', (response) => {
        onError(response?.error?.description ?? t('gateway_razorpay.payments.failed', 'Razorpay could not complete the payment.'))
      })
      checkout.open()
    } catch {
      setIsBusy(false)
      onError(t('gateway_razorpay.payments.loadFailed', 'Razorpay checkout could not be loaded. Check your connection and try again.'))
    }
  }, [confirm, onError, payload, ready, t])

  if (!ready) return null

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{t('gateway_razorpay.payments.title', 'Pay with Razorpay')}</p>
        <p className="text-sm text-muted-foreground">
          {t('gateway_razorpay.payments.description', 'UPI, cards, netbanking, and wallets. A secure Razorpay window will open.')}
        </p>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={props.disabled || isBusy}
          onClick={() => { void openCheckout() }}
        >
          {isBusy ? <Spinner className="mr-2 size-4" /> : null}
          {isBusy
            ? t('gateway_razorpay.payments.processing', 'Waiting for payment...')
            : t('gateway_razorpay.payments.submit', 'Pay securely')}
        </Button>
      </div>
    </div>
  )
}

registerEmbeddedPaymentGatewayRenderer({
  providerKey: 'razorpay',
  rendererKey: 'razorpay.checkout',
  Component: RazorpayCheckoutRenderer,
})

export default null
