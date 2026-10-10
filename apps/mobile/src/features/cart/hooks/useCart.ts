import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addCartLine,
  clearCart,
  getCart,
  removeCartLine,
  updateCartLine,
  type Cart,
  type CartLine,
  type CartLineInput,
} from '../../../lib/api/cart'
import { ApiError } from '../../../lib/api/errors'
import { toMajorUnits, toMinorUnits } from '../../../lib/api/money'

/**
 * Shared cart hook — built on `@tanstack/react-query`, mirroring
 * `apps/storefront/src/lib/cart/cart-context.tsx`'s optimistic-update +
 * rollback-on-error pattern. The server cart (keyed on this file's module
 * scope via `CART_QUERY_KEY`) is the single source of truth: every mutation
 * updates the cache optimistically so the UI responds instantly, then either
 * replaces it with the server's authoritative (re-priced) response on
 * success, or rolls it back to the pre-mutation snapshot on failure.
 *
 * `addLine`/`setQuantity`/`updateGift`/`removeLine`/`clear` are intentionally
 * `Promise<void>` per the contract other tasks (TASK-05's add-to-cart button,
 * TASK-07's checkout screen) code against — callers that care about failures
 * can still `await`/`.catch()` the promise (it rejects on error); the hook's
 * own `error` field is the no-try/catch-needed path for rendering a message.
 */

export const CART_QUERY_KEY = ['cart'] as const
const CART_MUTATION_KEY = ['cart', 'mutation'] as const

/** Soft client-side quantity guard; the server remains authoritative (and may clamp further per-product). */
const MAX_LINE_QUANTITY = 20

const EMPTY_CART: Cart = {
  id: '',
  currencyCode: 'INR',
  lines: [],
  totals: { subtotalMajor: 0, taxMajor: 0, itemCount: 0 },
  hasIssues: false,
  updatedAt: '',
}

let optimisticSeq = 0

function clampQuantity(quantity: number): number {
  return Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.floor(quantity)))
}

/** Same product+variant+giftWrap+giftMessage: the backend merges these into one line (see cart.ts). */
function sameLine(line: CartLine, input: CartLineInput): boolean {
  return (
    line.productId === input.productId &&
    (line.variantId ?? null) === (input.variantId ?? null) &&
    Boolean(line.giftWrap) === Boolean(input.giftWrap) &&
    (line.giftMessage ?? '').trim() === (input.giftMessage ?? '').trim()
  )
}

/** Recomputes a line's total from its (possibly just-changed) quantity, via integer minor units. */
function withLineTotal(line: CartLine): CartLine {
  const unitMinor = toMinorUnits(line.unitPriceMajor)
  return { ...line, lineTotalMajor: toMajorUnits(unitMinor * line.quantity) }
}

/** Recomputes the cart's subtotal/item count from its lines. Tax stays server-owned (not computable here). */
function withTotals(cart: Cart): Cart {
  const subtotalMinor = cart.lines.reduce((sum, line) => sum + toMinorUnits(line.lineTotalMajor), 0)
  const itemCount = cart.lines.reduce((sum, line) => sum + line.quantity, 0)
  return { ...cart, totals: { ...cart.totals, subtotalMajor: toMajorUnits(subtotalMinor), itemCount } }
}

function optimisticAdd(cart: Cart | undefined, input: CartLineInput): Cart {
  const base = cart ?? EMPTY_CART
  const existing = base.lines.find((line) => sameLine(line, input))
  const lines = existing
    ? base.lines.map((line) =>
        line === existing ? withLineTotal({ ...line, quantity: line.quantity + input.quantity }) : line,
      )
    : [
        ...base.lines,
        // Price unknown until the server responds (CartLineInput carries no price/display data);
        // shows as 0 for the brief optimistic window, then replaced by the authoritative line.
        withLineTotal({
          id: `optimistic-${++optimisticSeq}`,
          productId: input.productId,
          variantId: input.variantId,
          quantity: input.quantity,
          giftWrap: input.giftWrap,
          giftMessage: input.giftMessage,
          unitPriceMajor: 0,
          lineTotalMajor: 0,
        }),
      ]
  return withTotals({ ...base, lines })
}

function optimisticSetQuantity(cart: Cart | undefined, lineId: string, quantity: number): Cart {
  const base = cart ?? EMPTY_CART
  return withTotals({
    ...base,
    lines: base.lines.map((line) => (line.id === lineId ? withLineTotal({ ...line, quantity }) : line)),
  })
}

function optimisticUpdateGift(
  cart: Cart | undefined,
  lineId: string,
  patch: { giftWrap?: boolean; giftMessage?: string },
): Cart {
  const base = cart ?? EMPTY_CART
  return {
    ...base,
    lines: base.lines.map((line) =>
      line.id === lineId
        ? {
            ...line,
            giftWrap: patch.giftWrap ?? line.giftWrap,
            giftMessage: patch.giftMessage ?? line.giftMessage,
          }
        : line,
    ),
  }
}

function optimisticRemoveLine(cart: Cart | undefined, lineId: string): Cart {
  const base = cart ?? EMPTY_CART
  return withTotals({ ...base, lines: base.lines.filter((line) => line.id !== lineId) })
}

function optimisticClear(cart: Cart | undefined): Cart {
  const base = cart ?? EMPTY_CART
  return { ...base, lines: [], totals: { subtotalMajor: 0, taxMajor: 0, itemCount: 0 } }
}

export interface UseCartResult {
  cart: Cart | undefined
  isLoading: boolean
  error: ApiError | null
  addLine: (input: CartLineInput) => Promise<void>
  setQuantity: (lineId: string, quantity: number) => Promise<void>
  updateGift: (lineId: string, patch: { giftWrap?: boolean; giftMessage?: string }) => Promise<void>
  removeLine: (lineId: string) => Promise<void>
  clear: () => Promise<void>
}

export function useCart(): UseCartResult {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CART_QUERY_KEY,
    queryFn: getCart,
  })

  /** Shared onMutate/onError plumbing: snapshot + optimistic write, then rollback on failure. */
  const optimisticHandlers = useCallback(
    <Vars,>(optimistic: (cart: Cart | undefined, vars: Vars) => Cart) => ({
      mutationKey: CART_MUTATION_KEY,
      onMutate: async (vars: Vars) => {
        await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY })
        const previous = queryClient.getQueryData<Cart>(CART_QUERY_KEY)
        queryClient.setQueryData<Cart>(CART_QUERY_KEY, optimistic(previous, vars))
        return { previous }
      },
      onError: (_err: unknown, _vars: Vars, context: { previous: Cart | undefined } | undefined) => {
        queryClient.setQueryData(CART_QUERY_KEY, context?.previous)
        void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
      },
    }),
    [queryClient],
  )

  const addMutation = useMutation({
    mutationFn: (input: CartLineInput) => addCartLine(input),
    ...optimisticHandlers<CartLineInput>(optimisticAdd),
    onSuccess: (cart: Cart) => {
      if (queryClient.isMutating({ mutationKey: CART_MUTATION_KEY }) <= 1) {
        queryClient.setQueryData(CART_QUERY_KEY, cart)
      }
    },
  })

  const quantityMutation = useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
      updateCartLine(lineId, { quantity }),
    ...optimisticHandlers<{ lineId: string; quantity: number }>((cart, { lineId, quantity }) =>
      optimisticSetQuantity(cart, lineId, quantity),
    ),
    onSuccess: (cart: Cart) => {
      if (queryClient.isMutating({ mutationKey: CART_MUTATION_KEY }) <= 1) {
        queryClient.setQueryData(CART_QUERY_KEY, cart)
      }
    },
  })

  const giftMutation = useMutation({
    mutationFn: ({
      lineId,
      patch,
    }: {
      lineId: string
      patch: { giftWrap?: boolean; giftMessage?: string }
    }) => updateCartLine(lineId, patch),
    ...optimisticHandlers<{ lineId: string; patch: { giftWrap?: boolean; giftMessage?: string } }>(
      (cart, { lineId, patch }) => optimisticUpdateGift(cart, lineId, patch),
    ),
    onSuccess: (cart: Cart) => {
      if (queryClient.isMutating({ mutationKey: CART_MUTATION_KEY }) <= 1) {
        queryClient.setQueryData(CART_QUERY_KEY, cart)
      }
    },
  })

  const removeMutation = useMutation({
    mutationFn: (lineId: string) => removeCartLine(lineId),
    ...optimisticHandlers<string>(optimisticRemoveLine),
    onSuccess: (cart: Cart) => {
      if (queryClient.isMutating({ mutationKey: CART_MUTATION_KEY }) <= 1) {
        queryClient.setQueryData(CART_QUERY_KEY, cart)
      }
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => clearCart(),
    ...optimisticHandlers<void>(optimisticClear),
    onSuccess: () => {
      // clearCart() resolves void (no re-priced cart to write back); the optimistic empty cart
      // already reflects the result, but refetch to pick up the server's authoritative empty cart.
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
    },
  })

  const addLine = useCallback(
    async (input: CartLineInput) => {
      await addMutation.mutateAsync(input)
    },
    [addMutation],
  )

  const setQuantity = useCallback(
    async (lineId: string, quantity: number) => {
      await quantityMutation.mutateAsync({ lineId, quantity: clampQuantity(quantity) })
    },
    [quantityMutation],
  )

  const updateGift = useCallback(
    async (lineId: string, patch: { giftWrap?: boolean; giftMessage?: string }) => {
      await giftMutation.mutateAsync({ lineId, patch })
    },
    [giftMutation],
  )

  const removeLine = useCallback(
    async (lineId: string) => {
      // Not persisted yet; the in-flight add will settle (or roll back) it on its own.
      if (lineId.startsWith('optimistic-')) return
      await removeMutation.mutateAsync(lineId)
    },
    [removeMutation],
  )

  const clear = useCallback(async () => {
    await clearMutation.mutateAsync()
  }, [clearMutation])

  const error = useMemo<ApiError | null>(() => {
    const candidates = [
      query.error,
      addMutation.error,
      quantityMutation.error,
      giftMutation.error,
      removeMutation.error,
      clearMutation.error,
    ]
    const found = candidates.find((candidate) => candidate instanceof ApiError)
    return (found as ApiError | undefined) ?? null
  }, [
    query.error,
    addMutation.error,
    quantityMutation.error,
    giftMutation.error,
    removeMutation.error,
    clearMutation.error,
  ])

  return {
    cart: query.data,
    isLoading: query.isLoading,
    error,
    addLine,
    setQuantity,
    updateGift,
    removeLine,
    clear,
  }
}
