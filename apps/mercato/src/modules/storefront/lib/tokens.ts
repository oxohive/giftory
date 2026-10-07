import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { ORDER_ACCESS_MAX_ENTRIES } from './constants'

/** Opaque bearer secrets (cart token, guest order access). Only SHA-256 hashes are persisted. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokenMatchesHash(token: string, expectedHash: string | null | undefined): boolean {
  if (!expectedHash) return false
  const actual = Buffer.from(hashToken(token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(`${name}=`)) continue
    const raw = trimmed.slice(name.length + 1)
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readCartToken(req: Request, cookieName: string): string | null {
  const value = readCookie(req, cookieName)
  return value && TOKEN_PATTERN.test(value) ? value : null
}

export type OrderAccessEntry = { orderId: string; token: string }

/** Cookie format: `orderId.token|orderId.token` (most recent first, bounded). */
export function parseOrderAccess(value: string | null): OrderAccessEntry[] {
  if (!value) return []
  const entries: OrderAccessEntry[] = []
  for (const chunk of value.split('|')) {
    const [orderId, token] = chunk.split('.')
    if (!orderId || !token || !UUID_PATTERN.test(orderId) || !TOKEN_PATTERN.test(token)) continue
    entries.push({ orderId: orderId.toLowerCase(), token })
    if (entries.length >= ORDER_ACCESS_MAX_ENTRIES) break
  }
  return entries
}

export function serializeOrderAccess(entries: OrderAccessEntry[], added: OrderAccessEntry): string {
  const next = [added, ...entries.filter((entry) => entry.orderId !== added.orderId.toLowerCase())]
  return next
    .slice(0, ORDER_ACCESS_MAX_ENTRIES)
    .map((entry) => `${entry.orderId.toLowerCase()}.${entry.token}`)
    .join('|')
}
