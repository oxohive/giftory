import { EmptyState } from '@gift/ui'
import Link from 'next/link'

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <EmptyState
        title="We can't find that page"
        action={
          <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to dashboard
          </Link>
        }
      >
        Check the link, or go back to your dashboard.
      </EmptyState>
    </main>
  )
}
