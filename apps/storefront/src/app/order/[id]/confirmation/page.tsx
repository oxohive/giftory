import type { Metadata } from 'next'
import { OrderConfirmation } from '@/components/checkout/order-confirmation'

export const metadata: Metadata = { title: 'Order confirmed', robots: { index: false } }

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const status = typeof query.redirect_status === 'string' ? query.redirect_status : null
  return (
    <div className="container-page py-12">
      <OrderConfirmation orderId={decodeURIComponent(id)} redirectStatus={status} />
    </div>
  )
}
