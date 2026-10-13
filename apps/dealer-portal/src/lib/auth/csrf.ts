/**
 * CSRF defense for the BFF proxy (src/app/api/om/[...path]/route.ts).
 *
 * The session cookies (`auth_token`/`session_token`) are already `SameSite=Lax` on this app's
 * own origin — that attribute is set by the backend and forwarded verbatim through the proxy's
 * Set-Cookie passthrough (see route.ts). `SameSite=Lax` already withholds these cookies on a
 * cross-site POST/PUT/PATCH/DELETE (form submission or fetch), which defeats the classic CSRF
 * case for every mutating endpoint this proxy exposes, with no extra code.
 *
 * This Origin check is deliberate defense-in-depth on top of that, chosen over a double-submit
 * CSRF token specifically because it costs zero client-side integration for every feature task
 * that will add mutating calls on top of this proxy (capabilities PUT, staff invite POST, order
 * status POST, ledger POST, ...): every same-origin `fetch()`/form already sends a matching
 * `Origin` header automatically, so there is nothing for those tasks to remember to attach. It
 * closes the residual gap `SameSite=Lax` leaves open (browsers predating SameSite support, or
 * any future regression in the cookie attributes).
 */
export function isTrustedOrigin(originHeader: string | null | undefined, selfOrigin: string): boolean {
  // Browsers omit `Origin` on some same-origin requests (notably simple same-origin GETs, and
  // some older browsers for same-origin POSTs); treat absence as same-origin rather than
  // rejecting a legitimate same-origin call that happens not to send the header. A cross-site
  // request that actually matters here (fetch/XHR with credentials, or a POST form) always
  // carries an `Origin` header in every modern browser.
  if (!originHeader) return true
  return originHeader === selfOrigin
}
