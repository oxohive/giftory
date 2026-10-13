'use client'

import { request } from '@gift/api-client'
import { Button, type ButtonProps } from '@gift/ui'
import { useState } from 'react'

export function LogoutButton({ className, variant = 'outline', size = 'sm' }: Pick<ButtonProps, 'className' | 'variant' | 'size'>) {
  const [pending, setPending] = useState(false)

  async function onClick() {
    setPending(true)
    try {
      // The proxy normalizes the backend's 302-redirect logout into {ok:true} JSON — see
      // src/app/api/om/[...path]/route.ts.
      await request('auth/logout', { method: 'POST' })
    } catch {
      // Best-effort: fall through to leaving the portal regardless of whether the server-side
      // session revocation call itself succeeded — the user's intent ("sign me out") is honored
      // either way by sending them to a page that requires a fresh session.
    } finally {
      window.location.assign('/login?reason=signed-out')
    }
  }

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={onClick} disabled={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  )
}
