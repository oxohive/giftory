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

/**
 * The backend answers a wrong email/password with 401, which @gift/api-client's generic message
 * map turns into "Your session has expired" — wrong and confusing on a sign-in form (WCAG 3.3.1/
 * 3.3.3: the error must describe what actually went wrong). Map login's own statuses here.
 */
function loginErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.'
  if (err.status === 400) return 'Enter a valid email address and your password.'
  if (err.status === 401) return 'Invalid email or password.'
  if (err.status === 403) return 'This account is not authorized to use the dealer portal.'
  return err.message
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
      setError(loginErrorMessage(err))
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
