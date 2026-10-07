import type { Metadata } from 'next'
import { OrdersView } from '@/components/account/orders-view'

export const metadata: Metadata = { title: 'Orders', robots: { index: false } }

export default function OrdersPage() {
  return <OrdersView />
}
