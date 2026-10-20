import Link from 'next/link'
import {
  cn,
  formatDate,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@gift/ui'
import type { EnrichedOrderRow } from '@/lib/features/orders/list'

/**
 * Each row links to `/orders/[id]` using the ASSIGNMENT id (`row.assignmentId`), never the sales
 * order id — P2-UI-03's resolved "assignment-ID vs order-ID" question (API-CONTRACTS.md): the
 * dealer-facing detail/status routes are keyed by the assignment id, because a dealer may have
 * had multiple assignments over time for different orders, and the assignment is the one id
 * that's unambiguous to them. `/orders/[id]` itself is P2-UI-10's page, not yet built — linking to
 * it now is expected (a sibling, not-yet-started task), not a bug.
 *
 * Rendered as a real table on larger screens and as a stacked card list on mobile — a wide table
 * forced into horizontal scroll is harder to scan one-handed than one card per order. Both forms
 * read the exact same `items` array in the exact order it was given (see list.ts's
 * `enrichAssignments` doc comment on why reordering here would be a real correctness bug, not a
 * cosmetic one, once there is more than one page of results).
 */
export function OrdersTable({ items }: { items: EnrichedOrderRow[] }) {
  return (
    <>
      <TableContainer className="hidden sm:block">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Order</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Production deadline</TableHeaderCell>
              <TableHeaderCell>Products</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.assignmentId}>
                <TableCell>
                  <Link
                    href={`/orders/${row.assignmentId}`}
                    aria-label={`View order ${row.orderReference}`}
                    className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {row.orderReference}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge value={row.status} />
                </TableCell>
                <TableCell className="tabular-nums">{formatDate(row.requiredBy)}</TableCell>
                <TableCell className={cn('text-muted-foreground', row.detailError && 'italic')}>
                  {row.productSummary}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <ul className="grid gap-3 sm:hidden">
        {items.map((row) => (
          <li key={row.assignmentId} className="rounded-lg border border-border bg-surface p-4">
            <Link
              href={`/orders/${row.assignmentId}`}
              aria-label={`View order ${row.orderReference}`}
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {row.orderReference}
            </Link>
            <div className="mt-2 flex items-center justify-between gap-2">
              <StatusBadge value={row.status} />
              <span className="text-sm tabular-nums text-muted-foreground">{formatDate(row.requiredBy)}</span>
            </div>
            <p className={cn('mt-2 text-sm text-muted-foreground', row.detailError && 'italic')}>{row.productSummary}</p>
          </li>
        ))}
      </ul>
    </>
  )
}
