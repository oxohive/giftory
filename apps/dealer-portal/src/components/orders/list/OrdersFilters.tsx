'use client'

import { Field, Select, statusLabel } from '@gift/ui'
import {
  ORDER_STATUS_FILTERS,
  SORT_OPTIONS,
  sortKeyFor,
  sortOptionForKey,
  type OrderSortDir,
  type OrderSortField,
  type OrdersListState,
} from '@/lib/features/orders/list'

export interface OrdersFilterChange {
  status: OrdersListState['status']
  sortField: OrderSortField
  sortDir: OrderSortDir
}

/**
 * Status filter (the real `assignmentListQuerySchema.status` enum — see list.ts) plus a sort
 * control (the real `sortField`/`sortDir` pair, presented as one friendly dropdown rather than
 * two). Changing either calls `onChange` with the full next filter/sort state; the caller
 * (OrdersListView) is responsible for resetting `page` to 1 whenever this fires — this component
 * does not know about pagination at all, so it cannot forget to reset it inconsistently.
 */
export function OrdersFilters({
  state,
  onChange,
}: {
  state: OrdersListState
  onChange: (next: OrdersFilterChange) => void
}) {
  const sortKey = sortKeyFor(state.sortField, state.sortDir)
  const hasActiveFilter = state.status !== ''

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,240px)_auto] sm:items-end">
      <Field id="orders-status-filter" label="Status">
        <Select
          id="orders-status-filter"
          value={state.status}
          onChange={(event) => {
            const value = event.target.value as OrdersListState['status']
            onChange({ status: value, sortField: state.sortField, sortDir: state.sortDir })
          }}
        >
          <option value="">All statuses</option>
          {ORDER_STATUS_FILTERS.map((status) => (
            <option key={status} value={status} className="capitalize">
              {statusLabel(status)}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="orders-sort" label="Sort by">
        <Select
          id="orders-sort"
          value={sortKey}
          onChange={(event) => {
            const option = sortOptionForKey(event.target.value)
            onChange({ status: state.status, sortField: option.sortField, sortDir: option.sortDir })
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {hasActiveFilter ? (
        <button
          type="button"
          onClick={() => onChange({ status: '', sortField: state.sortField, sortDir: state.sortDir })}
          className="h-10 justify-self-start rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Clear filter
        </button>
      ) : null}
    </div>
  )
}
