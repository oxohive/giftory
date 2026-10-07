import type { Metadata } from 'next'
import { AddressesView } from '@/components/account/addresses-view'

export const metadata: Metadata = { title: 'Addresses', robots: { index: false } }

export default function AddressesPage() {
  return <AddressesView />
}
