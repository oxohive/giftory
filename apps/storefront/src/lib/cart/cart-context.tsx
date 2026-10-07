'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  cartApi,
  cartErrorMessage,
  clearLegacyCart,
  EMPTY_CART,
  isTransientError,
  MAX_LINE_QUANTITY,
  readLegacyCartLines,
  type Cart,
  type CartLine,
  type CartLineInput,
  type CartLinePatch,
} from '@/lib/api/cart'
import { useCustomer } from '@/lib/auth/use-customer'

/**
 * Cart state = the backend's server-side cart (src/lib/api/cart.ts), cached by TanStack Query under
 * CART_QUERY_KEY. Mutations update the cache optimistically, then replace it with the server's
 * re-priced cart (authoritative totals); on error the previous cart is restored, the error is kept
 * per line, and the cart is refetched.
 */

export const CART_QUERY_KEY = ['cart'] as const
const CART_MUTATION_KEY = ['cart', 'mutation'] as const

/** What the product page knows about a line, used only to render the optimistic line. */
export type AddLineInput = CartLineInput & {
  slug: string
  title: string
  variantName: string | null
  imageUrl: string | null
  unitPriceMinor: number | null
  currency: string
  maxQuantity: number | null
  isCustomizable: boolean
}

type CartContextValue = {
  cart: Cart
  lines: CartLine[]
  /** False until the server cart has loaded (or failed): avoid flashing an empty cart. */
  ready: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  /** True while a cart change is being saved. */
  isSyncing: boolean
  itemCount: number
  /** Server-priced subtotal (gross, minor units). */
  subtotalMinor: number
  hasIssues: boolean
  /** Errors of failed line updates, by line id. */
  lineErrors: Record<string, string>
  dismissLineError: (lineId: string) => void
  /** Error of a failed cart-wide change (e.g. emptying the cart). */
  cartError: string | null
  /** One-time message from the device-cart migration. */
  notice: string | null
  dismissNotice: () => void
  /** Resolves with the server cart; rejects with the backend validation error (see cartErrorMessage). */
  addLine: (input: AddLineInput) => Promise<Cart>
  setQuantity: (lineId: string, quantity: number) => void
  updateGift: (lineId: string, gift: { giftWrap: boolean; giftMessage: string }) => Promise<Cart>
  removeLine: (lineId: string) => void
  clear: () => Promise<Cart>
}

const CartContext = createContext<CartContextValue | null>(null)

let optimisticSeq = 0

function clampQuantity(quantity: number, max: number): number {
  return Math.max(1, Math.min(Math.min(MAX_LINE_QUANTITY, max), Math.floor(quantity)))
}

/** Approximate totals for an optimistic cart; replaced by the server totals on the response. */
function withTotals(cart: Cart, lines: CartLine[]): Cart {
  const priced = lines.map((line) =>
    line.pending && line.unitPriceMinor !== null ? { ...line, totalMinor: line.unitPriceMinor * line.quantity } : line,
  )
  return {
    ...cart,
    lines: priced,
    subtotalMinor: priced.reduce((sum, line) => sum + (line.totalMinor ?? 0), 0),
    itemCount: priced.reduce((sum, line) => sum + line.quantity, 0),
  }
}

function sameLine(line: CartLine, input: CartLineInput): boolean {
  return (
    line.productId === input.productId &&
    (line.variantId ?? null) === (input.variantId ?? null) &&
    line.gift.giftWrap === input.giftWrap &&
    line.gift.giftMessage.trim() === (input.giftMessage ?? '').trim()
  )
}

function toInput(input: AddLineInput): CartLineInput {
  return {
    productId: input.productId,
    variantId: input.variantId,
    quantity: input.quantity,
    giftWrap: input.giftWrap,
    giftMessage: input.giftMessage?.trim() || null,
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const customer = useCustomer()
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({})
  const [cartError, setCartError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The first cart read waits for the one-time device-cart migration (so it sees migrated lines).
  const [migrated, setMigrated] = useState(false)
  const migration = useRef<Promise<void> | null>(null)

  const query = useQuery({
    queryKey: CART_QUERY_KEY,
    queryFn: () => cartApi.get(),
    enabled: migrated,
    staleTime: 30_000,
    // Picks up changes made in other tabs (the server cart is shared by every tab of the shopper).
    refetchOnWindowFocus: true,
  })

  /* One-time migration of the old localStorage cart into the server cart. ------------------- */
  useEffect(() => {
    if (migration.current) return
    migration.current = (async () => {
      const legacy = readLegacyCartLines()
      if (!legacy.length) {
        clearLegacyCart() // also drops an unreadable leftover
        return
      }
      let latest: Cart | null = null
      let rejected = 0
      let interrupted = false
      // One line at a time: POST merges into the existing server cart (PUT would replace it, and
      // fails as a whole when a single line is invalid); sequential calls share one cart cookie.
      for (const line of legacy) {
        try {
          latest = await cartApi.addLine(line)
        } catch (error) {
          if (isTransientError(error)) {
            interrupted = true
            break
          }
          rejected += 1
        }
      }
      // Keep the device cart only if the backend could not be reached; try again on the next visit.
      if (!interrupted) clearLegacyCart()
      if (latest) queryClient.setQueryData(CART_QUERY_KEY, latest)
      if (rejected > 0) {
        setNotice(
          rejected === 1
            ? 'One item from your previous cart is no longer available and was removed.'
            : `${rejected} items from your previous cart are no longer available and were removed.`,
        )
      }
    })()
      .catch(() => undefined)
      .finally(() => setMigrated(true))
  }, [queryClient])

  /* Login/logout: the backend merges the anonymous cart into the customer's cart on the first cart
     call after login, and a signed-out shopper must not keep seeing the account's cart. */
  const customerId = customer.isSuccess ? (customer.data?.user.id ?? null) : undefined
  const previousCustomerId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (customerId === undefined) return
    const previous = previousCustomerId.current
    previousCustomerId.current = customerId
    if (previous === undefined || previous === customerId) return
    setLineErrors({})
    if (customerId === null) void queryClient.resetQueries({ queryKey: CART_QUERY_KEY })
    else void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
  }, [customerId, queryClient])

  /* Mutations ------------------------------------------------------------------------------- */

  const run = useCallback(
    async <T,>(work: () => Promise<T>) => {
      await migration.current
      return work()
    },
    [],
  )

  const setLineError = useCallback((lineId: string, message: string | null) => {
    setLineErrors((prev) => {
      if (message === null) {
        if (!(lineId in prev)) return prev
        const next = { ...prev }
        delete next[lineId]
        return next
      }
      return { ...prev, [lineId]: message }
    })
  }, [])

  const mutationHandlers = <V,>(options: { optimistic: (cart: Cart, vars: V) => Cart; lineId?: (vars: V) => string | null }) => ({
    mutationKey: CART_MUTATION_KEY,
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY })
      const previous = queryClient.getQueryData<Cart>(CART_QUERY_KEY)
      queryClient.setQueryData<Cart>(CART_QUERY_KEY, options.optimistic(previous ?? EMPTY_CART, vars))
      const lineId = options.lineId?.(vars)
      if (lineId) setLineError(lineId, null)
      setCartError(null)
      return { previous }
    },
    onError: (error: unknown, vars: V, context: { previous: Cart | undefined } | undefined) => {
      // Roll back, then refetch: other changes may have landed meanwhile.
      if (context) queryClient.setQueryData(CART_QUERY_KEY, context.previous)
      const lineId = options.lineId?.(vars)
      if (lineId) setLineError(lineId, cartErrorMessage(error))
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
    },
    onSuccess: (cart: Cart) => {
      // With several changes in flight, only the last response is written (it includes the others).
      if (queryClient.isMutating({ mutationKey: CART_MUTATION_KEY }) <= 1) queryClient.setQueryData(CART_QUERY_KEY, cart)
    },
  })

  const addMutation = useMutation({
    mutationFn: (input: AddLineInput) => run(() => cartApi.addLine(toInput(input))),
    ...mutationHandlers<AddLineInput>({
      optimistic: (cart, input) => {
        const existing = cart.lines.find((line) => sameLine(line, toInput(input)))
        const lines = existing
          ? cart.lines.map((line) =>
              line === existing ? { ...line, quantity: clampQuantity(line.quantity + input.quantity, line.maxQuantity), pending: true } : line,
            )
          : [
              ...cart.lines,
              {
                id: `optimistic-${++optimisticSeq}`,
                key: `optimistic-${optimisticSeq}`,
                productId: input.productId,
                variantId: input.variantId,
                slug: input.slug,
                title: input.title,
                variantName: input.variantName,
                imageUrl: input.imageUrl,
                quantity: clampQuantity(input.quantity, input.maxQuantity ?? MAX_LINE_QUANTITY),
                maxQuantity: Math.min(MAX_LINE_QUANTITY, input.maxQuantity ?? MAX_LINE_QUANTITY),
                currency: input.currency,
                unitPriceMinor: input.unitPriceMinor,
                totalMinor: null,
                gift: { giftWrap: input.giftWrap, giftMessage: input.giftMessage?.trim() ?? '' },
                isCustomizable: input.isCustomizable,
                available: true,
                issue: null,
                pending: true,
              },
            ]
        return withTotals(cart, lines)
      },
    }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ lineId, patch }: { lineId: string; patch: CartLinePatch }) => run(() => cartApi.updateLine(lineId, patch)),
    ...mutationHandlers<{ lineId: string; patch: CartLinePatch }>({
      lineId: (vars) => vars.lineId,
      optimistic: (cart, { lineId, patch }) =>
        withTotals(
          cart,
          cart.lines.map((line) =>
            line.id === lineId
              ? {
                  ...line,
                  quantity: patch.quantity ?? line.quantity,
                  gift: {
                    giftWrap: patch.giftWrap ?? line.gift.giftWrap,
                    giftMessage: patch.giftMessage !== undefined ? (patch.giftMessage ?? '') : line.gift.giftMessage,
                  },
                  pending: true,
                }
              : line,
          ),
        ),
    }),
  })

  const removeMutation = useMutation({
    mutationFn: (lineId: string) => run(() => cartApi.removeLine(lineId)),
    ...mutationHandlers<string>({
      lineId: (lineId) => lineId,
      optimistic: (cart, lineId) => withTotals(cart, cart.lines.filter((line) => line.id !== lineId)),
    }),
  })

  const clearMutation = useMutation({
    mutationFn: () => run(() => cartApi.clear()),
    ...mutationHandlers<void>({ optimistic: (cart) => withTotals(cart, []) }),
    onError: (error: unknown, _vars: void, context: { previous: Cart | undefined } | undefined) => {
      if (context) queryClient.setQueryData(CART_QUERY_KEY, context.previous)
      setCartError(cartErrorMessage(error))
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
    },
  })

  const { mutateAsync: addAsync } = addMutation
  const { mutate: update, mutateAsync: updateAsync } = updateMutation
  const { mutate: remove } = removeMutation
  const { mutateAsync: clearAsync } = clearMutation

  const addLine = useCallback((input: AddLineInput) => addAsync(input), [addAsync])
  const setQuantity = useCallback(
    (lineId: string, quantity: number) => update({ lineId, patch: { quantity: clampQuantity(quantity, MAX_LINE_QUANTITY) } }),
    [update],
  )
  const updateGift = useCallback(
    (lineId: string, gift: { giftWrap: boolean; giftMessage: string }) =>
      updateAsync({ lineId, patch: { giftWrap: gift.giftWrap, giftMessage: gift.giftMessage.trim() || null } }),
    [updateAsync],
  )
  const removeLine = useCallback(
    (lineId: string) => {
      if (lineId.startsWith('optimistic-')) return // not saved yet; the pending add will settle it
      remove(lineId)
    },
    [remove],
  )
  const clear = useCallback(() => clearAsync(), [clearAsync])
  const dismissLineError = useCallback((lineId: string) => setLineError(lineId, null), [setLineError])
  const dismissNotice = useCallback(() => setNotice(null), [])

  const cart = query.data ?? EMPTY_CART
  const isSyncing = addMutation.isPending || updateMutation.isPending || removeMutation.isPending || clearMutation.isPending
  const { refetch } = query

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      lines: cart.lines,
      ready: query.isSuccess || query.isError,
      isError: query.isError && !query.data,
      error: query.error,
      refetch: () => void refetch(),
      isSyncing,
      itemCount: cart.itemCount,
      subtotalMinor: cart.subtotalMinor,
      hasIssues: cart.hasIssues,
      lineErrors,
      dismissLineError,
      cartError,
      notice,
      dismissNotice,
      addLine,
      setQuantity,
      updateGift,
      removeLine,
      clear,
    }),
    [
      cart,
      query.isSuccess,
      query.isError,
      query.data,
      query.error,
      refetch,
      isSyncing,
      lineErrors,
      dismissLineError,
      cartError,
      notice,
      dismissNotice,
      addLine,
      setQuantity,
      updateGift,
      removeLine,
      clear,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
