/**
 * The shared core-auth password-reset routes (`POST /api/auth/reset`,
 * `.../reset/validate`, `.../reset/confirm` — @open-mercato/core) all read `req.formData()`
 * only, never JSON — same reason src/lib/http/login.ts translates the login payload. Translating
 * here lets every dealer-portal call go through the same JSON client (@gift/api-client's
 * `request()`), including the installed password-setup/reset flow.
 */
export function buildResetRequestForm(payload: { email: string }): string {
  const params = new URLSearchParams()
  params.set('email', payload.email ?? '')
  return params.toString()
}

export function buildResetValidateForm(payload: { token: string }): string {
  const params = new URLSearchParams()
  params.set('token', payload.token ?? '')
  return params.toString()
}

export function buildResetConfirmForm(payload: { token: string; password: string }): string {
  const params = new URLSearchParams()
  params.set('token', payload.token ?? '')
  params.set('password', payload.password ?? '')
  return params.toString()
}
