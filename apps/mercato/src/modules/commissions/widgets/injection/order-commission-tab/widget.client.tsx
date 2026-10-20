"use client"

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { ErrorMessage, TabEmptyState } from '@open-mercato/ui/backend/detail'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatBps, formatPaise } from '../../../components/money'

type WidgetContext = {
  kind?: 'order' | 'quote'
  record?: { id?: string }
  resourceId?: string
}

type SnapshotResponse = {
  commission: {
    id: string
    assignmentId: string
    orderId: string
    dealerProfileId: string
    subtotalAmount: number
    currencyCode: string
    commissionRateBps: number
    commissionAmount: number
    ruleId: string | null
    snapshottedAt: string
  }
}

/**
 * Read-only "Commission" tab injected into the admin order detail page
 * (spot `sales.document.detail.order:tabs`, confirmed live via
 * `src/modules/example/widgets/injection-table.ts`'s identical precedent
 * for this same spot). Shows the FROZEN rate/amount an order actually got
 * at assignment time — `GET /api/commissions/admin/orders/{id}/commission`
 * — never anything resolved live for "today", and offers no write
 * affordance: commission snapshots are immutable by design (see
 * `commissions/data/entities.ts`'s `OrderCommissionSnapshot` doc comment
 * and `docs/phase-2-status.md`'s "how the money flows" section).
 */
export default function OrderCommissionTabWidget({ context }: InjectionWidgetComponentProps<WidgetContext>) {
  const t = useT()
  const orderId = context?.record?.id ?? context?.resourceId ?? null

  const { data, isLoading, error, isError, refetch, isFetching } = useQuery<SnapshotResponse>({
    queryKey: ['commissions-order-tab', orderId],
    queryFn: () => readApiResultOrThrow<SnapshotResponse>(
      `/api/commissions/admin/orders/${encodeURIComponent(String(orderId))}/commission`,
      undefined,
      { errorMessage: t('commissions.admin.orderTab.errors.load', 'Failed to load commission for this order') },
    ),
    enabled: Boolean(orderId),
    retry: false,
  })

  if (!orderId) return null

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Spinner size="sm" /> {t('commissions.admin.orderTab.loading', 'Loading commission…')}
      </div>
    )
  }

  if (isError) {
    const status = (error as { status?: number } | undefined)?.status
    if (status === 404) {
      return (
        <TabEmptyState
          title={t('commissions.admin.orderTab.empty.title', 'No commission recorded')}
          description={t(
            'commissions.admin.orderTab.empty.description',
            'This order has not been assigned to a dealer, or no commission snapshot exists for it yet. A snapshot is created automatically the moment an order is assigned to a dealer.',
          )}
        />
      )
    }
    if (status === 403) {
      return (
        <Alert status="error" style="lighter">
          <AlertDescription>{t('commissions.admin.orderTab.errors.forbidden', "You don't have permission to view this order's commission.")}</AlertDescription>
        </Alert>
      )
    }
    return (
      <ErrorMessage
        label={error instanceof Error ? error.message : t('commissions.admin.orderTab.errors.load', 'Failed to load commission for this order')}
        action={(
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {t('commissions.admin.orderTab.actions.retry', 'Retry')}
          </Button>
        )}
      />
    )
  }

  const snapshot = data?.commission
  if (!snapshot) return null

  return (
    <div className="space-y-3">
      <Alert status="information" style="lighter">
        <AlertDescription>
          {t(
            'commissions.admin.orderTab.immutableNotice',
            'This is the rate and amount frozen when the order was assigned to this dealer. It never changes afterward — even if the commission rule that produced it is later edited or deactivated.',
          )}
        </AlertDescription>
      </Alert>
      <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">{t('commissions.admin.orderTab.field.rate', 'Commission rate (frozen)')}</dt>
          <dd className="tabular-nums">{formatBps(snapshot.commissionRateBps)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('commissions.admin.orderTab.field.subtotal', 'Order subtotal')}</dt>
          <dd className="tabular-nums">{formatPaise(snapshot.subtotalAmount, snapshot.currencyCode)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('commissions.admin.orderTab.field.amount', 'Commission amount (frozen)')}</dt>
          <dd className="tabular-nums text-lg font-semibold">{formatPaise(snapshot.commissionAmount, snapshot.currencyCode)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('commissions.admin.orderTab.field.snapshottedAt', 'Frozen at')}</dt>
          <dd className="tabular-nums">{new Date(snapshot.snapshottedAt).toLocaleString()}</dd>
        </div>
      </dl>
      {snapshot.ruleId ? (
        <p className="text-xs text-muted-foreground">
          {t('commissions.admin.orderTab.ruleIdHint', `Applied rule id: ${snapshot.ruleId}`, { ruleId: snapshot.ruleId })}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('commissions.admin.orderTab.noRuleHint', 'No commission rule matched this dealer/product type at assignment time — the commission was recorded as 0.')}
        </p>
      )}
    </div>
  )
}
