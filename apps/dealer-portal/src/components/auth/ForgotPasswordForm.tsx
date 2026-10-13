'use client'

import { request } from '@gift/api-client'
import { Button, Field, Input } from '@gift/ui'
import { useState, type FormEvent } from 'react'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await request('auth/reset', { method: 'POST', body: JSON.stringify({ email }) })
    } catch {
      // The backend always responds {ok:true} regardless of whether the address is registered,
      // specifically so this page can never be used to probe account existence (see
      // @open-mercato/core's auth AGENTS.md). A network/proxy failure is the only real error
      // case this could ever hit, and even then the same confirmation is shown rather than a
      // retry loop that would re-probe the same email.
    } finally {
      setSubmitting(false)
      setDone(true)
    }
  }

  if (done) {
    return (
      <div className="grid gap-3 text-center">
        <h1 className="text-lg font-semibold text-foreground">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          If an account exists for that address, we sent a link to reset your password.
        </p>
        <a href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          Back to sign in
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">We will email you a link to set a new one.</p>
      </div>
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
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reset link'}
      </Button>
      <a href="/login" className="text-center text-sm text-primary underline-offset-4 hover:underline">
        Back to sign in
      </a>
    </form>
  )
}
