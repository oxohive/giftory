'use client'

import { ApiError, request } from '@gift/api-client'
import { Button, ErrorNotice, Field, Input } from '@gift/ui'
import { useState, type FormEvent } from 'react'

/**
 * Used both for an installed invitation (a brand-new dealer owner/staff user's first password)
 * and a forgot-password reset — the backend's token mechanism (`PasswordReset`) is identical for
 * both (see @open-mercato/core's `auth` module, `commands/users.ts`'s `sendInviteToUser`), so one
 * form covers both flows.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await request('auth/reset/confirm', { method: 'POST', body: JSON.stringify({ token, password }) })
      window.location.assign('/login?reason=password-updated')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Set your password</h1>
      </div>
      {error ? <ErrorNotice message={error} /> : null}
      <Field id="password" label="New password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field id="confirm" label="Confirm password">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Set password'}
      </Button>
    </form>
  )
}
