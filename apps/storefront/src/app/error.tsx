'use client'

import { useEffect } from 'react'
import { StateMessage } from '@/components/state-message'
import { Button } from '@/components/ui/button'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div className="container-page py-16">
      <StateMessage
        kind="error"
        title="Something went wrong"
        action={
          <Button onClick={reset} variant="outline">
            Try again
          </Button>
        }
      >
        Please try again. If the problem continues, come back in a little while.
      </StateMessage>
    </div>
  )
}
