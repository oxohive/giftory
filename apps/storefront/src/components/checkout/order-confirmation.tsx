'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Gift, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'
import { Price } from '@/components/catalog/price'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/http'
import { ordersApi } from '@/lib/api/orders'
import { CART_QUERY_KEY } from '@/lib/cart/cart-context'
import { writeCheckoutSession } from '@/lib/checkout/checkout-session'

/**
 * Confirmation after payment. For Stripe redirect-based methods, Stripe appends
 * `payment_intent`, `payment_intent_client_secret` and `redirect_status` to the return URL.
 * The authoritative payment state is set server-side by the gateway webhook.
 */
export function OrderConfirmation({ orderId, redirectStatus }: { orderId: string; redirectStatus: string | null }) {
  const queryClient = useQueryClient()
  const failed = redirectStatus === 'failed'

  useEffect(() => {
    // The backend closed the server cart when the order was created: show the fresh (empty) cart.
    void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
    // Paid (or processing): this order no longer needs a payment retry. A failed payment keeps it,
    // so "Try again" on /checkout reopens payment for the same order instead of placing a new one.
    if (!failed) {
      writeCheckoutSession((prev) =>
        prev.pendingOrder?.orderId === orderId ? { ...prev, orderKey: null, uncertain: false, pendingOrder: null } : prev,
      )
    }
  }, [failed, orderId, queryClient])

  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.get(orderId),
    retry: false,
  })

  if (failed) {
    return (
      <div className="mx-auto grid max-w-xl gap-6 text-center">
        <XCircle className="mx-auto size-14 text-danger" aria-hidden="true" />
        <h1 className="text-3xl font-semibold">Payment not completed</h1>
        <p className="text-muted-foreground">Your bank declined or cancelled the payment. Your order is saved, so you can try paying again without placing it twice.</p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link href="/checkout">Try again</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/account/orders">View my orders</Link>
          </Button>
        </div>
      </div>
    )
  }

  const signedOut = order.error instanceof ApiError && (order.error.status === 401 || order.error.status === 403)

  return (
    <div className="mx-auto grid max-w-2xl gap-8">
      <div className="grid gap-3 text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden="true" />
        <h1 className="text-3xl font-semibold">Thank you — your gift is on its way!</h1>
        <p className="text-muted-foreground">
          {redirectStatus === 'processing'
            ? 'Your payment is processing. We’ll email you as soon as it’s confirmed.'
            : 'We’ve received your order and emailed your receipt.'}
        </p>
        <p className="text-sm">
          Order reference: <span className="font-mono font-medium">{order.data?.orderNumber ?? orderId}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="size-5 text-primary" aria-hidden="true" /> Order details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {order.isLoading ? (
            <div className="grid gap-2" aria-busy="true">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : order.data ? (
            <ul className="grid gap-2 text-sm">
              {order.data.lines.map((line) => (
                <li key={line.id} className="flex justify-between gap-3">
                  <span>
                    {line.name} <span className="text-muted-foreground">× {line.quantity}</span>
                  </span>
                  {line.totalMinor !== null ? <Price minor={line.totalMinor} currency={order.data.currency} /> : null}
                </li>
              ))}
              {order.data.grandTotalMinor !== null ? (
                <li className="flex justify-between border-t border-border pt-2 font-semibold">
                  <span>Total paid</span>
                  <Price minor={order.data.grandTotalMinor} currency={order.data.currency} />
                </li>
              ) : null}
            </ul>
          ) : signedOut ? (
            <p className="text-sm text-muted-foreground">
              <Link href="/account/login?next=/account/orders" className="font-medium text-primary hover:underline">
                Sign in
              </Link>{' '}
              to see your order details and track delivery.
            </p>
          ) : (
            <Alert tone="info">Order details will appear in your account shortly.</Alert>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/products">Continue shopping</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/account/orders">View my orders</Link>
        </Button>
      </div>
    </div>
  )
}
