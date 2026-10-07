import Link from 'next/link'
import { StateMessage } from '@/components/state-message'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="container-page py-16">
      <StateMessage
        title="We couldn’t find that page"
        action={
          <Button asChild>
            <Link href="/products">Browse gifts</Link>
          </Button>
        }
      >
        The gift you’re looking for may have been unwrapped already.
      </StateMessage>
    </div>
  )
}
