import {
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
import type { CommissionSnapshot } from '@gift/api-client'
import { formatMoney } from '@/lib/money'
import { commissionRateLabel } from '@/lib/features/finance/display'

const COLUMN_COUNT = 5

/**
 * Read-only commission-per-assignment table. No per-row action menu, no edit/delete affordance —
 * `OrderCommissionSnapshot` rows are immutable by design (API-CONTRACTS.md: "Snapshots are
 * immutable — later rule edits never affect past orders").
 */
export function EarningsTable({ items, loading }: { items: CommissionSnapshot[]; loading: boolean }) {
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Date</TableHeaderCell>
            <TableHeaderCell>Order</TableHeaderCell>
            <TableHeaderCell>Subtotal</TableHeaderCell>
            <TableHeaderCell>Rate</TableHeaderCell>
            <TableHeaderCell>Commission</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableStateRow colSpan={COLUMN_COUNT}>
              <LoadingState label="Loading earnings…" />
            </TableStateRow>
          ) : items.length === 0 ? (
            <TableStateRow colSpan={COLUMN_COUNT}>
              <EmptyState title="No commission earnings yet">
                Commission snapshots appear here once an assigned order is recorded.
              </EmptyState>
            </TableStateRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{formatDateTime(item.snapshottedAt)}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{item.orderId.slice(0, 8)}…</TableCell>
                <TableCell className="tabular-nums">{formatMoney(item.subtotalAmount, item.currencyCode)}</TableCell>
                <TableCell>{commissionRateLabel(item)}</TableCell>
                <TableCell className="tabular-nums font-semibold">
                  {formatMoney(item.commissionAmount, item.currencyCode)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
