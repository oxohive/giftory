import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from './cn'
import { pageCount } from './pagination-math'

/** Prev/next pager for a `{items,total,page,pageSize}` list response (see API-CONTRACTS.md). */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}) {
  const pages = pageCount(total, pageSize)
  const atStart = page <= 1
  const atEnd = page >= pages
  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-between gap-3 text-sm', className)}>
      <p className="text-muted-foreground">
        Page {page} of {pages} · {total} {total === 1 ? 'result' : 'results'}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={atStart}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> Previous
        </button>
        <button
          type="button"
          disabled={atEnd}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Next <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
