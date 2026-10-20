'use client'

import { ErrorNotice } from '@gift/ui'
import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md">
        <ErrorNotice message="We couldn't load this page. Your changes may not have been saved." onRetry={reset} />
      </div>
    </main>
  )
}
