import { createHash } from 'node:crypto'
import { CHECKOUT_CLAIM_STALE_MS, CHECKOUT_STATUS } from './constants'

/**
 * Idempotency for order placement. The `Idempotency-Key` header is scoped to
 * the tenant + organization and bound to a hash of the canonical request
 * (including the shopper identity), so a key can only ever replay the request
 * it was first used with.
 */

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_\-:.]{16,128}$/

export function normalizeIdempotencyKey(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return IDEMPOTENCY_KEY_PATTERN.test(trimmed) ? trimmed : null
}

/** JSON with sorted object keys, so semantically equal payloads hash equally. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

export function hashRequest(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

export type CheckoutLedgerState = {
  requestHash: string
  status: string
  claimedAt: Date | null
  orderId: string | null
}

export type IdempotencyDecision =
  /** The key already produced an order for a different payload: reject (409). */
  | 'mismatch'
  /** Another request with this key is still running: ask the client to retry later (409). */
  | 'in_progress'
  /** Same payload, order already created: continue from the stored state. */
  | 'resume'
  /** A previous attempt stalled before creating any order: take over its claim (payload may differ). */
  | 'reclaim'

export function decideIdempotency(existing: CheckoutLedgerState, incomingHash: string, now: Date): IdempotencyDecision {
  const hasOrder = Boolean(existing.orderId) || existing.status === CHECKOUT_STATUS.completed || existing.status === CHECKOUT_STATUS.orderCreated
  if (hasOrder) return existing.requestHash === incomingHash ? 'resume' : 'mismatch'
  const claimedAt = existing.claimedAt?.getTime() ?? 0
  if (now.getTime() - claimedAt < CHECKOUT_CLAIM_STALE_MS) return 'in_progress'
  return 'reclaim'
}

/** Substitute the `{orderId}` placeholder the storefront puts in its success URL. */
export function substituteOrderId(template: string, orderId: string): string {
  return template.split('{orderId}').join(encodeURIComponent(orderId))
}
