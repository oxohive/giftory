import { useCallback, useEffect, useRef, useState } from 'react'
import * as SecureStore from 'expo-secure-store'

/**
 * TASK-08's guest-only replacement for the authenticated `GET /storefront/orders`
 * list endpoint (see AccountScreen.tsx's top-of-file comment for the full scoping
 * rationale). This device remembers which orders *it* placed by persisting a small
 * `{orderId, orderNumber, placedAt}` record the moment checkout succeeds; each
 * entry is later re-fetched via `getOrder(orderId)` (works for a guest holding the
 * `sf_order_access` cookie set at checkout — see orders.ts).
 *
 * Nothing sensitive (cookies, tokens) is stored here — only the order id/number/
 * timestamp needed to look the order back up and label it in a list.
 */

export interface TrackedOrder {
  orderId: string
  orderNumber: string
  placedAt: string
}

export interface UseLocalOrderHistoryResult {
  orders: TrackedOrder[]
  /** TASK-07's ConfirmationScreen calls this right after a successful order placement. */
  track: (order: TrackedOrder) => Promise<void>
  isLoading: boolean
}

const STORAGE_KEY = 'giftory.localOrderHistory.v1'
// Local "recent orders" list for this device/session only — not meant to grow
// without bound, so the oldest entries roll off past this count.
const MAX_TRACKED_ORDERS = 25

function parseStored(raw: string | null): TrackedOrder[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is TrackedOrder =>
        !!entry &&
        typeof entry === 'object' &&
        typeof entry.orderId === 'string' &&
        typeof entry.orderNumber === 'string' &&
        typeof entry.placedAt === 'string',
    )
  } catch {
    return []
  }
}

export function useLocalOrderHistory(): UseLocalOrderHistoryResult {
  const [orders, setOrders] = useState<TrackedOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Mirrors `orders` synchronously so `track()` can read-modify-write without
  // racing the in-flight initial load or a stale closure over `orders`.
  const ordersRef = useRef<TrackedOrder[]>([])
  const readyRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadPromise = (async () => {
      let loaded: TrackedOrder[] = []
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY)
        loaded = parseStored(raw)
      } catch {
        loaded = []
      }
      ordersRef.current = loaded
      if (!cancelled) {
        setOrders(loaded)
        setIsLoading(false)
      }
    })()
    readyRef.current = loadPromise
    return () => {
      cancelled = true
    }
  }, [])

  const track = useCallback(async (order: TrackedOrder) => {
    if (readyRef.current) {
      await readyRef.current
    }
    const next = [order, ...ordersRef.current.filter((existing) => existing.orderId !== order.orderId)].slice(
      0,
      MAX_TRACKED_ORDERS,
    )
    ordersRef.current = next
    setOrders(next)
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Best-effort persistence: in-memory state above still reflects the
      // tracked order for the rest of this app session even if the device
      // write fails (e.g. SecureStore unavailable on this device/simulator).
    }
  }, [])

  return { orders, track, isLoading }
}
