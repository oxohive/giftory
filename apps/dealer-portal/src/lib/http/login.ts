/**
 * The shared core-auth login route (`POST /api/auth/login`, @open-mercato/core) expects
 * `application/x-www-form-urlencoded`, not JSON — unlike every dealer-facing route in the five
 * Phase 2 modules. Translating here lets every dealer-portal call go through the same JSON
 * client (@gift/api-client's `request()`), including login.
 */
export interface LoginPayload {
  email: string
  password: string
  remember?: boolean
  tenantId?: string
}

export function buildLoginForm(payload: LoginPayload): string {
  const params = new URLSearchParams()
  params.set('email', payload.email ?? '')
  params.set('password', payload.password ?? '')
  if (payload.remember) params.set('remember', 'true')
  if (payload.tenantId) params.set('tenantId', payload.tenantId)
  return params.toString()
}
