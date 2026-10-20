'use client'

import { Field, Select } from '@gift/ui'
import type { LedgerDirection, LedgerEntryType } from '@gift/api-client'
import { entryTypeLabel } from '@/lib/features/finance/display'
import { LEDGER_DIRECTIONS, LEDGER_ENTRY_TYPES } from '@/lib/features/finance/query'

export interface LedgerFilterState {
  entryType: LedgerEntryType | ''
  direction: LedgerDirection | ''
}

export const EMPTY_LEDGER_FILTERS: LedgerFilterState = { entryType: '', direction: '' }

/**
 * Only the two filters `GET /api/payouts/dealer/ledger` actually accepts (`entryType`,
 * `direction`) — no date-range control, since the backend has no date filter param for this
 * route (a client-side-only date filter would silently only ever apply to the single page of
 * rows already loaded, not the dealer's full history).
 */
export function LedgerFilters({
  value,
  onChange,
}: {
  value: LedgerFilterState
  onChange: (next: LedgerFilterState) => void
}) {
  const hasActiveFilter = value.entryType !== '' || value.direction !== ''
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,160px)_auto] sm:items-end">
      <Field id="ledger-entry-type" label="Entry type">
        <Select
          id="ledger-entry-type"
          value={value.entryType}
          onChange={(e) => onChange({ ...value, entryType: e.target.value as LedgerEntryType | '' })}
        >
          <option value="">All types</option>
          {LEDGER_ENTRY_TYPES.map((type) => (
            <option key={type} value={type}>
              {entryTypeLabel(type)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="ledger-direction" label="Direction">
        <Select
          id="ledger-direction"
          value={value.direction}
          onChange={(e) => onChange({ ...value, direction: e.target.value as LedgerDirection | '' })}
        >
          <option value="">Credits and debits</option>
          {LEDGER_DIRECTIONS.map((direction) => (
            <option key={direction} value={direction}>
              {direction === 'credit' ? 'Credit' : 'Debit'}
            </option>
          ))}
        </Select>
      </Field>
      {hasActiveFilter ? (
        <button
          type="button"
          onClick={() => onChange(EMPTY_LEDGER_FILTERS)}
          className="h-10 justify-self-start rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}
