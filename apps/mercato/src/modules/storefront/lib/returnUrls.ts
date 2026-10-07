/**
 * Payment success/cancel URLs are handed to the gateway, which redirects the
 * shopper there. To avoid an open redirect they must point at an allowed
 * storefront origin: `STOREFRONT_ALLOWED_RETURN_ORIGINS` (CSV), falling back to
 * `APP_ALLOWED_ORIGINS`, `APP_URL` and `NEXT_PUBLIC_APP_URL`. Loopback origins
 * are accepted outside production. With nothing configured in production every
 * URL is rejected (fail closed).
 */

function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

export function configuredReturnOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const raw = [
    ...(env.STOREFRONT_ALLOWED_RETURN_ORIGINS ?? '').split(','),
    ...(env.APP_ALLOWED_ORIGINS ?? '').split(','),
    env.APP_URL ?? '',
    env.NEXT_PUBLIC_APP_URL ?? '',
  ]
  const origins = new Set<string>()
  for (const candidate of raw) {
    const trimmed = candidate.trim()
    if (!trimmed) continue
    const origin = parseOrigin(trimmed)
    if (origin) origins.add(origin)
  }
  return Array.from(origins)
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export function isAllowedReturnUrl(value: string, env: Record<string, string | undefined> = process.env): boolean {
  let url: URL
  try {
    // `{orderId}` is substituted later; validate the template with a neutral value.
    url = new URL(value.split('{orderId}').join('order'))
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  const allowed = configuredReturnOrigins(env)
  if (allowed.includes(url.origin)) return true
  return env.NODE_ENV !== 'production' && isLoopback(url.hostname)
}
