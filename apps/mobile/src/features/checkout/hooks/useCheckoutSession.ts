import { useCallback, useSyncExternalStore } from 'react'
import { newIdempotencyKey } from '../../../lib/api/idempotency'
import type { Address, PlacedOrder, ShippingMethod } from '../../../lib/api/checkout'

/**
 * Local state machine shared by the Address -> Shipping -> Payment ->
 * Confirmation screens for a single checkout attempt.
 *
 * Implemented as a module-level store (subscribed to via
 * `useSyncExternalStore`) rather than a React Context, because wiring a
 * Provider around the checkout screens would require editing the navigator
 * files that host them (`CartStackNavigator.tsx`), which is out of this
 * task's boundary (`apps/mobile/src/features/checkout/**` only). Every
 * screen that calls `useCheckoutSession()` reads and writes the same shared
 * state, so e.g. the address entered on `AddressScreen` is visible to
 * `PaymentScreen` without any prop drilling or navigation params.
 */
export interface CheckoutSessionState {
  /** Contact email for guest checkout (`PlaceOrderInput.email`). */
  email: string
  address: Address | null
  shippingMethod: ShippingMethod | null
  /**
   * Idempotency key for this checkout attempt's `POST /checkout/orders`
   * call. Generated once when the attempt starts (first render after the
   * last `restart()`) and reused across any retry — a network timeout, the
   * user double-tapping "Pay now", or a backend 5xx that leaves the order's
   * existence ambiguous — so the backend's idempotent-replay behavior (same
   * key + same body -> the existing order, no duplicate) actually protects
   * against double-charging. `openPaymentSession`/`confirmRazorpayPayment`
   * each get their OWN fresh key per call (per the task spec), so they are
   * intentionally not tracked here.
   */
  orderIdempotencyKey: string
  /** The order returned by the most recent `placeOrder`/`openPaymentSession` call, if any. */
  order: PlacedOrder | null
}

function createInitialState(): CheckoutSessionState {
  return {
    email: '',
    address: null,
    shippingMethod: null,
    orderIdempotencyKey: newIdempotencyKey(),
    order: null,
  }
}

let state: CheckoutSessionState = createInitialState()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): CheckoutSessionState {
  return state
}

function patchState(patch: Partial<CheckoutSessionState>): void {
  state = { ...state, ...patch }
  emit()
}

export interface UseCheckoutSessionResult extends CheckoutSessionState {
  setEmail: (email: string) => void
  setAddress: (address: Address) => void
  setShippingMethod: (method: ShippingMethod) => void
  setOrder: (order: PlacedOrder | null) => void
  /**
   * Call ONLY when the user explicitly abandons this checkout attempt and
   * starts a new one (e.g. "Continue shopping" after a confirmed order, or a
   * deliberate "start over"). Rotates the idempotency key and clears
   * everything else. Never call this to recover from a network error or a
   * declined/cancelled payment — those must reuse the same key/order (see
   * `orderIdempotencyKey` and `order` above).
   */
  restart: () => void
}

export function useCheckoutSession(): UseCheckoutSessionResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  const setEmail = useCallback((email: string) => patchState({ email }), [])
  const setAddress = useCallback((address: Address) => patchState({ address }), [])
  const setShippingMethod = useCallback((method: ShippingMethod) => patchState({ shippingMethod: method }), [])
  const setOrder = useCallback((order: PlacedOrder | null) => patchState({ order }), [])
  const restart = useCallback(() => {
    state = createInitialState()
    emit()
  }, [])

  return { ...snapshot, setEmail, setAddress, setShippingMethod, setOrder, restart }
}

/** Test/dev-only escape hatch to force a clean session between unrelated test cases. */
export function __resetCheckoutSessionForTests(): void {
  state = createInitialState()
  emit()
}
