'use client'

import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { StateMessage } from '@/components/state-message'
import { Button } from '@/components/ui/button'
import { customerApi } from '@/lib/api/customer'

export function VerifyEmail({ token }: { token: string | null }) {
  const verify = useMutation({ mutationFn: (t: string) => customerApi.verifyEmail(t) })
  const { mutate } = verify
  // Tokens are single-use: guard against React StrictMode's double effect run.
  const sent = useRef<string | null>(null)

  useEffect(() => {
    if (token && sent.current !== token) {
      sent.current = token
      mutate(token)
    }
  }, [token, mutate])

  if (!token || verify.isError) {
    return (
      <StateMessage
        kind="error"
        title="This link is invalid or has expired"
        action={
          <Button asChild variant="outline">
            <Link href="/account/register">Register again</Link>
          </Button>
        }
      >
        Verification links expire after 24 hours.
      </StateMessage>
    )
  }

  if (verify.isSuccess) {
    return (
      <div className="grid justify-items-center gap-4 text-center" role="status">
        <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Your email is verified</h1>
        <Button asChild>
          <Link href="/account/login?verified=1">Sign in</Link>
        </Button>
      </div>
    )
  }

  return (
    <p role="status" className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden="true" /> Verifying your email…
    </p>
  )
}
