'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Gift } from 'lucide-react'
import Link from 'next/link'
import { Price } from '@/components/catalog/price'
import { StateMessage } from '@/components/state-message'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/http'
import { ordersApi } from '@/lib/api/orders'
import { AccountShell } from './account-shell'
import { formatDate } from './orders-view'

function OrderDetail({ orderId }: { orderId: string }) {
  const order = useQuery({ queryKey: ['order', orderId], queryFn: () => ordersApi.get(orderId) })

  if (order.isLoading) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (order.isError || !order.data) {
    const notFound = order.error instanceof ApiError && (order.error.status === 404 || order.error.status === 403)
    return (
      <StateMessage kind="error" title={notFound ? 'Order not found' : 'We couldn’t load this order'}>
        {notFound ? 'This order doesn’t belong to your account.' : 'Please try again.'}
      </StateMessage>
    )
  }

  const o = order.data
  return (
    <div className="grid gap-6">
      <Link href="/account/orders" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All orders
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold">Order {o.orderNumber ?? o.id.slice(0, 8)}</h2>
        {o.status ? <Badge variant="outline">{o.status}</Badge> : null}
        {o.paymentStatus ? <Badge>{o.paymentStatus}</Badge> : null}
      </div>
      <p className="text-sm text-muted-foreground">Placed {formatDate(o.placedAt)}</p>
      {o.detailLevel === 'limited' ? (
        <Alert tone="info" title="Limited details">
          Prices, delivery status and tracking will appear here once full order tracking is enabled.
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {o.lines.map((line) => (
              <li key={line.id} className="flex justify-between gap-4 py-3 text-sm">
                <span className="grid gap-1">
                  <span className="font-medium">
                    {line.name} <span className="text-muted-foreground">× {line.quantity}</span>
                  </span>
                  {line.sku ? <span className="text-xs text-muted-foreground">SKU {line.sku}</span> : null}
                  {line.giftWrap ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Gift className="size-3" aria-hidden="true" /> Gift wrapped
                    </span>
                  ) : null}
                  {line.giftMessage ? <span className="text-xs italic text-muted-foreground">“{line.giftMessage}”</span> : null}
                </span>
                {line.totalMinor !== null ? <Price minor={line.totalMinor} currency={o.currency} /> : null}
              </li>
            ))}
          </ul>
          {o.grandTotalMinor !== null ? (
            <p className="flex justify-between border-t border-border pt-3 font-semibold">
              <span>Total</span>
              <Price minor={o.grandTotalMinor} currency={o.currency} />
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export function OrderDetailView({ orderId }: { orderId: string }) {
  return <AccountShell title="Order details">{() => <OrderDetail orderId={orderId} />}</AccountShell>
}
