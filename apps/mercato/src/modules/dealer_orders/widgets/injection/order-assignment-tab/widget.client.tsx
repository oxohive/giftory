'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, PackagePlus, Repeat, XCircle } from 'lucide-react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { hasFeature } from '@open-mercato/shared/security/features'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, TabEmptyState, AccessDeniedMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { DealerOption } from '../../../components/DealerPicker'
import { AssignDialog } from '../../../components/AssignDialog'
import { CancelAssignmentDialog } from '../../../components/CancelAssignmentDialog'

type WidgetContext = {
  kind?: 'order' | 'quote'
  record?: { id?: string }
  resourceId?: string
}

type SerializedAssignment = {
  id: string
  orderId: string
  dealerProfileId: string
  assignedBy: string
  assignedAt: string | null
  requiredBy: string
  status: 'assigned' | 'acknowledged' | 'in_production' | 'ready_for_dispatch' | 'dispatched' | 'cancelled'
  statusUpdatedAt: string | null
  statusNote: string | null
  cancelledReason: string | null
  updatedAt: string | null
}

type CurrentAssignmentResponse = { assignment: SerializedAssignment | null }
type AssignmentHistoryResponse = { items: SerializedAssignment[] }
type DealersListResponse = { items: DealerOption[] }

const STATUS_VARIANT: Record<SerializedAssignment['status'], StatusBadgeVariant> = {
  assigned: 'info',
  acknowledged: 'info',
  in_production: 'warning',
  ready_for_dispatch: 'warning',
  dispatched: 'success',
  cancelled: 'neutral',
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

/**
 * "Dealer assignment" tab injected into the admin order detail page
 * (spot `sales.document.detail.order:tabs`, confirmed live via
 * `commissions/widgets/injection-table.ts`'s identical precedent for this
 * same spot — the frozen "do not modify core/other-module files" rule
 * applies equally here: this is a SEPARATE module contributing its own tab
 * to the same slot, not a change to commissions' or core's files).
 *
 * This is the ACTION tab (assign/reassign/cancel) — distinct from
 * commissions' read-only "Order commission" tab already live on the same
 * page (P2-UI-15).
 *
 * Deliberately does NOT read order fields (payment status, line items)
 * from `context.record` to pre-validate or filter anything: the injected
 * tab context's `DocumentRecord` type (core `sales` module,
 * `backend/sales/documents/[id]/page.tsx`) does not carry line items at
 * all, and per this task's brief the paid-order gate is the server's
 * `assertOrderIsPaid` alone — this tab only ever surfaces that rejection
 * after the fact, never pre-checks it. The eligible-dealer "capability
 * hint" (`DealerPicker`) is informational only for the same reason — see
 * its own doc comment.
 */
export default function OrderAssignmentTabWidget({ context }: InjectionWidgetComponentProps<WidgetContext>) {
  const t = useT()
  const orderId = context?.record?.id ?? context?.resourceId ?? null
  const queryClient = useQueryClient()
  const chrome = useBackendChrome()
  const canManage = chrome.isReady && hasFeature(chrome.payload?.grantedFeatures, 'dealer_orders.manage')

  const [assignOpen, setAssignOpen] = React.useState(false)
  const [reassignOpen, setReassignOpen] = React.useState(false)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [accessDenied, setAccessDenied] = React.useState(false)

  const assignmentQuery = useQuery<CurrentAssignmentResponse>({
    queryKey: ['dealer-orders-assignment-tab', orderId],
    queryFn: () => readApiResultOrThrow<CurrentAssignmentResponse>(
      `/api/dealer_orders/admin/orders/${encodeURIComponent(String(orderId))}/assignment`,
      undefined,
      { errorMessage: t('dealer_orders.admin.orderTab.errors.load', 'Failed to load the dealer assignment for this order') },
    ),
    enabled: Boolean(orderId),
    retry: false,
  })

  const historyQuery = useQuery<AssignmentHistoryResponse>({
    queryKey: ['dealer-orders-assignment-history', orderId],
    queryFn: () => readApiResultOrThrow<AssignmentHistoryResponse>(
      `/api/dealer_orders/admin/orders/${encodeURIComponent(String(orderId))}/assignments`,
      undefined,
      { errorMessage: t('dealer_orders.admin.orderTab.errors.loadHistory', 'Failed to load the assignment history for this order') },
    ),
    enabled: Boolean(orderId) && historyOpen,
    retry: false,
  })

  // Approved dealers directory — fetched once, shared by the picker (both
  // dialogs) and by the current-assignment/history displays (to resolve a
  // `dealerProfileId` into a business name without an N+1 lookup per row).
  // Single page of up to 100 — see this task's handoff for the documented
  // scope cut on tenants with more approved dealers than that.
  const dealersQuery = useQuery<DealersListResponse>({
    queryKey: ['dealer-orders-assignment-tab-dealers'],
    queryFn: () => readApiResultOrThrow<DealersListResponse>(
      `/api/dealer_org_rbac/admin/dealers?pageSize=100`,
      undefined,
      { errorMessage: t('dealer_orders.admin.orderTab.errors.loadDealers', 'Failed to load the approved dealers list') },
    ),
    enabled: Boolean(orderId),
    retry: false,
  })

  const dealersData = dealersQuery.data?.items
  const dealers = React.useMemo(() => dealersData ?? [], [dealersData])
  const dealersById = React.useMemo(() => new Map(dealers.map((d) => [d.id, d])), [dealers])

  const refreshAssignment = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['dealer-orders-assignment-tab', orderId] })
    if (historyOpen) void queryClient.invalidateQueries({ queryKey: ['dealer-orders-assignment-history', orderId] })
  }, [historyOpen, orderId, queryClient])

  const handleStaleState = React.useCallback((message: string) => {
    flash(message || t('dealer_orders.admin.orderTab.staleState', 'This order’s assignment changed elsewhere — showing the latest state.'), 'error')
    refreshAssignment()
  }, [refreshAssignment, t])

  if (!orderId) return null

  if (accessDenied) {
    return (
      <AccessDeniedMessage label={t('dealer_orders.admin.orderTab.errors.forbidden', "You don't have permission to manage this order's dealer assignment.")} />
    )
  }

  if (assignmentQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Spinner size="sm" /> {t('dealer_orders.admin.orderTab.loading', 'Loading dealer assignment…')}
      </div>
    )
  }

  if (assignmentQuery.isError) {
    const status = (assignmentQuery.error as { status?: number } | undefined)?.status
    if (status === 403) {
      return (
        <Alert status="error" style="lighter">
          <AlertDescription>{t('dealer_orders.admin.orderTab.errors.forbidden', "You don't have permission to view this order's dealer assignment.")}</AlertDescription>
        </Alert>
      )
    }
    return (
      <ErrorMessage
        label={assignmentQuery.error instanceof Error ? assignmentQuery.error.message : t('dealer_orders.admin.orderTab.errors.load', 'Failed to load the dealer assignment for this order')}
        action={(
          <Button type="button" variant="outline" size="sm" onClick={() => void assignmentQuery.refetch()} disabled={assignmentQuery.isFetching}>
            {t('dealer_orders.admin.orderTab.actions.retry', 'Retry')}
          </Button>
        )}
      />
    )
  }

  const assignment = assignmentQuery.data?.assignment ?? null
  const assignedDealer = assignment ? dealersById.get(assignment.dealerProfileId) ?? null : null

  return (
    <div className="space-y-4">
      {!assignment ? (
        <>
          <TabEmptyState
            title={t('dealer_orders.admin.orderTab.empty.title', 'No dealer assigned yet')}
            description={t('dealer_orders.admin.orderTab.empty.description', 'Assign this order to an approved dealer. The order must be fully paid before it can be assigned.')}
          />
          {canManage ? (
            <Button type="button" onClick={() => setAssignOpen(true)}>
              <PackagePlus className="size-4 mr-2" />
              {t('dealer_orders.admin.orderTab.actions.assign', 'Assign to dealer')}
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">{t('dealer_orders.admin.orderTab.field.dealer', 'Dealer')}</dt>
              <dd>
                {assignedDealer
                  ? assignedDealer.businessName
                  : dealersQuery.isLoading
                    ? <Spinner size="sm" />
                    : t('dealer_orders.admin.orderTab.field.unknownDealer', 'Dealer {{id}} (not found in the approved-dealers directory)', { id: assignment.dealerProfileId })}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('dealer_orders.admin.orderTab.field.status', 'Status')}</dt>
              <dd>
                <StatusBadge variant={STATUS_VARIANT[assignment.status]} dot>
                  {t(`dealer_orders.status.${assignment.status}`, assignment.status)}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('dealer_orders.admin.orderTab.field.requiredBy', 'Production deadline')}</dt>
              <dd className="tabular-nums">{assignment.requiredBy}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('dealer_orders.admin.orderTab.field.assignedAt', 'Assigned at')}</dt>
              <dd className="tabular-nums">{formatTimestamp(assignment.assignedAt)}</dd>
            </div>
            {assignment.statusNote ? (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">{t('dealer_orders.admin.orderTab.field.statusNote', 'Latest dealer note')}</dt>
                <dd className="break-words">{assignment.statusNote}</dd>
              </div>
            ) : null}
          </dl>

          {canManage && assignment.status !== 'cancelled' ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setReassignOpen(true)}>
                <Repeat className="size-4 mr-2" />
                {t('dealer_orders.admin.orderTab.actions.reassign', 'Reassign')}
              </Button>
              <Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
                <XCircle className="size-4 mr-2" />
                {t('dealer_orders.admin.orderTab.actions.cancel', 'Cancel assignment')}
              </Button>
            </div>
          ) : null}

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen((prev) => !prev)}
            >
              {historyOpen ? <ChevronDown className="size-4 mr-1" /> : <ChevronRight className="size-4 mr-1" />}
              {t('dealer_orders.admin.orderTab.actions.toggleHistory', 'Assignment history')}
            </Button>
            {historyOpen ? (
              historyQuery.isLoading ? (
                <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                  <Spinner size="sm" /> {t('dealer_orders.admin.orderTab.loadingHistory', 'Loading history…')}
                </div>
              ) : historyQuery.isError ? (
                <p className="p-2 text-sm text-destructive">
                  {historyQuery.error instanceof Error ? historyQuery.error.message : t('dealer_orders.admin.orderTab.errors.loadHistory', 'Failed to load the assignment history for this order')}
                </p>
              ) : (
                <ul className="mt-2 divide-y rounded-lg border">
                  {(historyQuery.data?.items ?? []).map((row) => {
                    const rowDealer = dealersById.get(row.dealerProfileId)
                    return (
                      <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                        <div className="space-y-0.5">
                          <p className="font-medium">{rowDealer ? rowDealer.businessName : row.dealerProfileId}</p>
                          <p className="text-muted-foreground">
                            {t('dealer_orders.admin.orderTab.history.assignedThenRequired', 'Assigned {{assignedAt}} · due {{requiredBy}}', {
                              assignedAt: formatTimestamp(row.assignedAt),
                              requiredBy: row.requiredBy,
                            })}
                            {row.cancelledReason ? ` · ${row.cancelledReason}` : ''}
                          </p>
                        </div>
                        <StatusBadge variant={STATUS_VARIANT[row.status]} dot>
                          {t(`dealer_orders.status.${row.status}`, row.status)}
                        </StatusBadge>
                      </li>
                    )
                  })}
                  {(historyQuery.data?.items ?? []).length === 0 ? (
                    <li className="p-3 text-sm text-muted-foreground">
                      {t('dealer_orders.admin.orderTab.history.empty', 'No assignment history yet.')}
                    </li>
                  ) : null}
                </ul>
              )
            ) : null}
          </div>
        </>
      )}

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        mode="assign"
        orderId={orderId}
        dealers={dealers}
        dealersLoading={dealersQuery.isLoading}
        onSuccess={() => {
          flash(t('dealer_orders.admin.orderTab.success.assigned', 'Order assigned'), 'success')
          refreshAssignment()
        }}
        onStaleState={handleStaleState}
        onForbidden={() => setAccessDenied(true)}
      />
      <AssignDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        mode="reassign"
        orderId={orderId}
        dealers={dealers}
        dealersLoading={dealersQuery.isLoading}
        onSuccess={() => {
          flash(t('dealer_orders.admin.orderTab.success.reassigned', 'Order reassigned'), 'success')
          refreshAssignment()
        }}
        onStaleState={handleStaleState}
        onForbidden={() => setAccessDenied(true)}
      />
      <CancelAssignmentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orderId={orderId}
        onCancelled={() => {
          flash(t('dealer_orders.admin.orderTab.success.cancelled', 'Assignment cancelled'), 'success')
          refreshAssignment()
        }}
        onStaleState={handleStaleState}
        onForbidden={() => setAccessDenied(true)}
      />
    </div>
  )
}
