import type { Metadata } from 'next'
import { CartView } from '@/components/cart/cart-view'

export const metadata: Metadata = { title: 'Your cart', robots: { index: false } }

export default function CartPage() {
  return (
    <div className="container-page py-8">
      <h1 className="mb-6 text-3xl font-semibold">Your cart</h1>
      <CartView />
    </div>
  )
}
