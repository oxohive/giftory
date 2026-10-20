import {
  cn,
  EmptyState,
  formatDateTime,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableStateRow,
} from '@gift/ui'
import type { LedgerEntry } from '@gift/api-client'
import { entryTone, entryTypeLabel, formatSignedAmount } from '@/lib/features/finance/display'

const COLUMN_COUNT = 4

/**
 * Read-only, append-only ledger table — no per-row action menu, no edit/delete affordance. There
 * is no PUT/PATCH/DELETE route for a ledger entry anywhere in the backend
 * (API-CONTRACTS.md: "No `updatedAt` — append-only by design, no update/delete route exists
 * anywhere in this module"); corrections are new adjustment entries recorded by an admin, never
 * an edit to this row, and recording one is out of scope for this dealer-facing, read-only view.
 */
export function LedgerTable({ items, loading }: { items: LedgerEntry[]; loading: boolean }) {
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Date</TableHeaderCell>
            <TableHeaderCell>Type</TableHeaderCell>
            <TableHeaderCell>Amount</TableHeaderCell>
            <TableHeaderCell>Note / reference</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableStateRow colSpan={COLUMN_COUNT}>
              <LoadingState label="Loading ledger…" />
            </TableStateRow>
          ) : items.length === 0 ? (
            <TableStateRow colSpan={COLUMN_COUNT}>
              <EmptyState title="No ledger entries yet">
                Commission credits, payouts and adjustments will appear here as they happen.
              </EmptyState>
            </TableStateRow>
          ) : (
            items.map((entry) => {
              const tone = entryTone(entry.direction)
              return (
                <TableRow key={entry.id}>
                  <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                        tone === 'credit' ? 'bg-success text-success-foreground' : 'bg-danger text-danger-foreground',
                      )}
                    >
                      {entryTypeLabel(entry.entryType)}
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn('tabular-nums font-semibold', tone === 'credit' ? 'text-success' : 'text-danger')}
                  >
                    {formatSignedAmount(entry.amount, entry.direction, entry.currencyCode)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entry.note ?? '—'}</TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
