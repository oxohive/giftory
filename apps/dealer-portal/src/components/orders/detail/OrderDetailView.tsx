'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorNotice, LoadingState, PermissionDenied, SessionExpired, StatusBadge, formatDate, formatDateTime } from '@gift/ui'
import { classifyOrderDetailError, fetchOrderDetail, orderReferenceLabel } from '@/lib/features/orders/detail'
import { OrderLineItems } from './OrderLineItems'
import { StatusUpdateForm } from './StatusUpdateForm'

/**
 * `/orders/[id]` — order detail + production-status update (TASK-10). `assignmentId` is the
 * ASSIGNMENT id (never the sales order id) — see `detail.ts`'s header comment.
 *
 * Renders exactly the safe, FEAT-010-scoped projection `GET .../dealer/orders/{assignmentId}`
 * returns: order reference, status, production deadline, delivery city/pincode, and per-line
 * product/variant/quantity/gift message/production requirements. There is no customer name,
 * phone, full address or email anywhere in this component tree — every field is read off the
 * typed `DealerOrderDetail` shape by name (see `detail.ts`), never spread from the raw response.
 *
 * Four distinct non-happy-path states this screen must render clearly, per TASK-10's acceptance
 * criteria, each with its own copy rather than a single generic error:
 *   1. Cancelled/reassigned — `detail.status === 'cancelled'` (the assignment row persists for
 *      this dealer even after a reassignment away from them — only its status changes).
 *   2. Stale/conflicting transition attempt — a 409 on the status mutation (handled inside
 *      `StatusUpdateForm`, since it is a mutation-level, not a page-level, failure).
 *   3. Forbidden caller — 403 on the GET itself (`PermissionDenied` below).
 *   4. Missing/not-found assignment — 404 on the GET (covers both a truly missing id and a
 *      cross-dealer guess/enumeration attempt; the backend returns the identical 404 for both on
 *      purpose, so this UI does too rather than ever hinting which case it was).
 */
export function OrderDetailView({ assignmentId }: { assignmentId: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const queryKey = ['order-detail', assignmentId] as const

  const query = useQuery({
    queryKey,
    queryFn: () => fetchOrderDetail(assignmentId),
  })

  if (query.isLoading) return <LoadingState label="Loading order…" />

  if (query.isError) {
    const kind = classifyOrderDetailError(query.error)
    if (kind === 'unauthorized') return <SessionExpired onSignIn={() => router.push('/login')} />
    if (kind === 'forbidden') return <PermissionDenied message="You do not have permission to view this order." />
    if (kind === 'not_found') {
      return (
        <div className="grid gap-4 text-center">
          <h1 className="text-lg font-semibold text-foreground">Order not found</h1>
          <p className="justify-self-center max-w-sm text-sm text-muted-foreground">
            This order either doesn&apos;t exist, isn&apos;t assigned to your business, or you don&apos;t
            have permission to view it.
          </p>
          <Link href="/orders" className="justify-self-center text-sm text-primary underline-offset-4 hover:underline">
            Back to orders
          </Link>
        </div>
      )
    }
    return <ErrorNotice message="Couldn't load this order." onRetry={() => query.refetch()} />
  }

  if (!query.data) return null
  const detail = query.data

  /**
   * After a successful status mutation, refresh FROM THE SERVER — re-fetch the detail route
   * rather than locally assuming the requested transition applied. `invalidateQueries` forces
   * the next render to come from a fresh `fetchOrderDetail` response.
   */
  function refreshFromServer() {
    return queryClient.invalidateQueries({ queryKey })
  }

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/orders" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">{orderReferenceLabel(detail.orderNumber)}</h1>
          <StatusBadge value={detail.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Production deadline: <span className="font-medium text-foreground">{formatDate(detail.requiredBy)}</span>
        </p>
      </div>

      {detail.status === 'cancelled' ? (
        <ErrorNotice message="This assignment was cancelled or reassigned. No further action is needed from you." />
      ) : null}

      <section className="grid gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Delivery</h2>
        <dl className="grid gap-1 text-sm">
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">City</dt>
            <dd className="text-foreground">{detail.shipping.city ?? 'Not provided'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">Pincode</dt>
            <dd className="text-foreground">{detail.shipping.pincode ?? 'Not provided'}</dd>
          </div>
        </dl>
      </section>

      <OrderLineItems lines={detail.lines} />

      {detail.statusNote ? (
        <section className="grid gap-1 rounded-lg border border-border bg-surface-muted p-4">
          <h2 className="text-sm font-semibold text-foreground">Latest note</h2>
          <p className="text-sm text-foreground">{detail.statusNote}</p>
          <p className="text-xs text-muted-foreground">Updated {formatDateTime(detail.statusUpdatedAt)}</p>
        </section>
      ) : null}

      <StatusUpdateForm
        assignmentId={detail.assignmentId}
        status={detail.status}
        updatedAt={detail.updatedAt}
        onUpdated={refreshFromServer}
      />
    </div>
  )
}
