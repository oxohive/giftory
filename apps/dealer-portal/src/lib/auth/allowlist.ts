/**
 * Additional BFF-proxy allowlist entries owned by this task (P2-UI-04): the installed
 * password-reset / invite-password-setup flow. Deliberately kept separate from
 * src/lib/http/allowlist.ts (owned by lane A / P2-UI-01, which already covers login/logout/
 * refresh/profile and every dealer-facing route) rather than editing that file — the proxy
 * composes both allowlists (`isAllowed(...) || isAuthAllowed(...)`), so this is additive, not a
 * replacement.
 */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface Rule {
  pattern: RegExp
  methods: Method[]
}

const AUTH_ALLOWED: Rule[] = [
  { pattern: /^auth\/reset$/, methods: ['POST'] },
  { pattern: /^auth\/reset\/validate$/, methods: ['POST'] },
  { pattern: /^auth\/reset\/confirm$/, methods: ['POST'] },
]

/** These three are unauthenticated by design (no session exists yet) — never trigger the
 *  proxy's transparent auth_token refresh for them. */
export const AUTH_NO_REFRESH = new Set<string>(['auth/reset', 'auth/reset/validate', 'auth/reset/confirm'])

/** Paths whose JSON request body must be translated to form-encoded before reaching the
 *  backend — see reset-form.ts. */
export const AUTH_FORM_ENCODED_PATHS = new Set<string>(['auth/reset', 'auth/reset/validate', 'auth/reset/confirm'])

export function isAuthAllowed(path: string, method: string): boolean {
  if (path.includes('..') || path.includes('//')) return false
  return AUTH_ALLOWED.some((rule) => rule.pattern.test(path) && rule.methods.includes(method as Method))
}
