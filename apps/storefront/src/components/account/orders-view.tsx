'use client'

import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Package } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Price } from '@/components/catalog/price'
import { StateMessage } from '@/components/state-message'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/http'
import { ordersApi } from '@/lib/api/orders'
import { AccountShell } from './account-shell'

export function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function OrdersList() {
  const [page, setPage] = useState(1)
  const orders = useQuery({ queryKey: ['orders', page], queryFn: () => ordersApi.list(page) })

  if (orders.isLoading) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <span className="sr-only" role="status">
          Loading orders…
        </span>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  if (orders.isError) {
    const notLinked = orders.error instanceof ApiError && orders.error.status === 403
    return (
      <StateMessage kind={notLinked ? 'empty' : 'error'} title={notLinked ? 'No orders yet' : 'We couldn’t load your orders'}>
        {notLinked
          ? 'Your account isn’t linked to any orders yet.'
          : orders.error instanceof Error
            ? orders.error.message
            : 'Please try again.'}
      </StateMessage>
    )
  }

  const data = orders.data
  if (!data || data.items.length === 0) {
    return (
      <StateMessage
        title="No orders yet"
        action={
          <Button asChild>
            <Link href="/products">Find a gift</Link>
          </Button>
        }
      >
        When you place an order it will show up here.
      </StateMessage>
    )
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))
  return (
    <div className="grid gap-4">
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {data.items.map((order) => (
          <li key={order.id}>
            <Link
              href={`/account/orders/${encodeURIComponent(order.id)}`}
              className="flex items-center gap-4 p-4 hover:bg-surface-muted focus-visible:bg-surface-muted"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <Package className="size-5" aria-hidden="true" />
              </span>
              <span className="grid flex-1 gap-0.5">
                <span className="font-medium">Order {order.orderNumber}</span>
                <span className="text-sm text-muted-foreground">Placed {formatDate(order.placedAt)}</span>
              </span>
              <span className="font-semibold">
                <Price minor={order.grandTotalMinor} currency={order.currency} fallback="—" />
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  )
}

export function OrdersView() {
  return <AccountShell title="Orders">{() => <OrdersList />}</AccountShell>
}
