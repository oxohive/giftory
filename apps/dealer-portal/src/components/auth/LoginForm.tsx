'use client'

import { ApiError, request } from '@gift/api-client'
import { Button, Checkbox, ErrorNotice, Field, Input } from '@gift/ui'
import { useState, type FormEvent } from 'react'
import { sanitizeReturnTo } from '@/lib/auth/return-to'

const REASON_COPY: Record<string, string> = {
  expired: 'Your session has ended. Please sign in again.',
  unavailable: "We couldn't verify your session. Please sign in again.",
  'signed-out': 'You have been signed out.',
  'password-updated': 'Your password has been updated. Please sign in.',
}

export function LoginForm({ returnTo, reason }: { returnTo: string; reason?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const notice = reason ? REASON_COPY[reason] : undefined

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await request('auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, remember }),
      })
      // Full navigation (not client-side routing) so the new httpOnly session cookie is present
      // for the very next Server Component render that decides access.
      window.location.assign(sanitizeReturnTo(returnTo))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Sign in</h1>
        <p className="text-sm text-muted-foreground">Access your dealer account.</p>
      </div>
      {notice ? <ErrorNotice message={notice} /> : null}
      {error ? <ErrorNotice message={error} /> : null}
      <Field id="email" label="Email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field id="password" label="Password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember me
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
      <a href="/forgot-password" className="text-center text-sm text-primary underline-offset-4 hover:underline">
        Forgot your password?
      </a>
    </form>
  )
}
