'use client'

import { useSyncExternalStore } from 'react'
import { z } from 'zod'

/**
 * Per-tab checkout state kept in sessionStorage, so it survives reloads, payment redirects
 * (Stripe 3DS / bank pages) and the confirmation page's "Try again" link:
 * - `orderKey`: the Idempotency-Key of the current checkout attempt. Created once, reused by every
 *   retry of order placement, and only replaced once that attempt produced an order.
 * - `uncertain`: the last placement attempt failed without an answer (network/5xx), so an order
 *   may exist even though we never saw it.
 * - `pendingOrder`: an order that exists but is not paid yet. Payment is retried through
 *   POST /api/storefront/orders/{id}/payment-session with `paymentKey`, never by placing a new order.
 */

const pendingOrderSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string().nullable(),
  grandTotalMinor: z.number().int().nullable(),
  currency: z.string(),
  email: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  provider: z.enum(['stripe', 'razorpay']),
  /** Idempotency-Key of the current payment-session request; reset after each consumed session. */
  paymentKey: z.string().nullable(),
})
export type PendingOrder = z.infer<typeof pendingOrderSchema>

const stateSchema = z.object({
  version: z.literal(1),
  orderKey: z.string().nullable(),
  uncertain: z.boolean(),
  pendingOrder: pendingOrderSchema.nullable(),
})
export type CheckoutSessionState = z.infer<typeof stateSchema>

const STORAGE_KEY = 'sf.checkout.v1'
const EMPTY: CheckoutSessionState = { version: 1, orderKey: null, uncertain: false, pendingOrder: null }

let memoryRaw: string | null = null // fallback when sessionStorage is unavailable
let cache: { raw: string | null; state: CheckoutSessionState } | null = null
const listeners = new Set<() => void>()

function readRaw(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return memoryRaw
  }
}

function getSnapshot(): CheckoutSessionState {
  const raw = readRaw()
  if (cache && cache.raw === raw) return cache.state
  let state = EMPTY
  if (raw) {
    try {
      const parsed = stateSchema.safeParse(JSON.parse(raw))
      if (parsed.success) state = parsed.data
    } catch {
      // unreadable: start over
    }
  }
  cache = { raw, state }
  return state
}

const getServerSnapshot = () => EMPTY

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Synchronous read (for mutation functions that must see the latest key). */
export function readCheckoutSession(): CheckoutSessionState {
  return getSnapshot()
}

export function writeCheckoutSession(update: (prev: CheckoutSessionState) => CheckoutSessionState): CheckoutSessionState {
  const next = update(getSnapshot())
  const raw = JSON.stringify(next)
  memoryRaw = raw
  try {
    window.sessionStorage.setItem(STORAGE_KEY, raw)
  } catch {
    // storage unavailable: memoryRaw keeps it for this page
  }
  cache = { raw, state: next }
  for (const listener of listeners) listener()
  return next
}

const noopSubscribe = () => () => {}

export function useCheckoutSession() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  /** False during SSR/hydration, before sessionStorage has been read. */
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false)
  return { state, ready, update: writeCheckoutSession }
}
