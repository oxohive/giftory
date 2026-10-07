import type { Metadata } from 'next'
import { CheckoutForm } from '@/components/checkout/checkout-form'
import { Alert } from '@/components/ui/alert'

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } }

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  return (
    <div className="container-page py-8">
      <h1 className="mb-6 text-3xl font-semibold">Checkout</h1>
      {params.cancelled ? (
        <Alert tone="warning" title="Payment cancelled" className="mb-6">
          Your payment wasn’t completed. You can try again below.
        </Alert>
      ) : null}
      <CheckoutForm />
    </div>
  )
}
