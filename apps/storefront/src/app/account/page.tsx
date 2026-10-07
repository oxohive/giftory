import type { Metadata } from 'next'
import { ProfileView } from '@/components/account/profile-view'

export const metadata: Metadata = { title: 'My account', robots: { index: false } }

export default function AccountPage() {
  return <ProfileView />
}
