'use client'

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { StripeClientConfig } from '@/lib/api/payments'
import { formatMoney } from '@/lib/money'

const stripePromises = new Map<string, Promise<Stripe | null>>()

/** Stripe.js is only fetched once a Stripe payment session exists (checkout page only). */
function getStripe(publishableKey: string) {
  let promise = stripePromises.get(publishableKey)
  if (!promise) {
    promise = loadStripe(publishableKey)
    stripePromises.set(publishableKey, promise)
  }
  return promise
}

/** Stripe Appearance needs hex/rgb colours (our tokens are oklch), so mirror --primary here. */
const BRAND_PRIMARY = { light: '#b4532a', dark: '#e0895a' } as const

function StripeConfirmForm({
  returnUrl,
  amountMinor,
  onSucceeded,
}: {
  returnUrl: string
  amountMinor: number
  onSucceeded: (paymentIntentId: string | null) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      // Cards without 3DS stay on the page; redirect-based methods come back via return_url.
      redirect: 'if_required',
    })
    if (result.error) {
      setError(result.error.message ?? 'Your payment could not be completed.')
      setSubmitting(false)
      return
    }
    onSucceeded(result.paymentIntent?.id ?? null)
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error ? <Alert tone="error" title="Payment failed">{error}</Alert> : null}
      <Button type="submit" size="lg" disabled={!stripe || !elements || submitting}>
        <Lock aria-hidden="true" />
        {submitting ? 'Processing…' : `Pay ${formatMoney(amountMinor)}`}
      </Button>
    </form>
  )
}

export function StripePayment({
  config,
  returnUrl,
  amountMinor,
  onSucceeded,
}: {
  config: StripeClientConfig
  returnUrl: string
  amountMinor: number
  onSucceeded: (paymentIntentId: string | null) => void
}) {
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  return (
    <Elements
      stripe={getStripe(config.publishableKey)}
      options={{
        clientSecret: config.clientSecret,
        appearance: {
          theme: dark ? 'night' : 'stripe',
          variables: {
            colorPrimary: dark ? BRAND_PRIMARY.dark : BRAND_PRIMARY.light,
            borderRadius: '10px',
          },
        },
      }}
    >
      <StripeConfirmForm returnUrl={returnUrl} amountMinor={amountMinor} onSucceeded={onSucceeded} />
    </Elements>
  )
}
