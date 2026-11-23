import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from './cn'
import { pageCount } from './pagination-math'

const BUTTON_CLASS =
  'inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-surface-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

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
      {/* Polite live region: announces the new page/result count after paging or filtering (WCAG 4.1.3). */}
      <p className="text-muted-foreground" aria-live="polite">
        Page {page} of {pages} · {total} {total === 1 ? 'result' : 'results'}
      </p>
      <div className="flex gap-2">
        {/* aria-disabled (not `disabled`) so a keyboard user who pages onto the first/last page
            keeps focus on the button instead of being dropped onto <body> (WCAG 2.4.3). */}
        <button
          type="button"
          aria-disabled={atStart || undefined}
          onClick={() => {
            if (!atStart) onPageChange(page - 1)
          }}
          aria-label="Previous page"
          className={BUTTON_CLASS}
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> Previous
        </button>
        <button
          type="button"
          aria-disabled={atEnd || undefined}
          onClick={() => {
            if (!atEnd) onPageChange(page + 1)
          }}
          aria-label="Next page"
          className={BUTTON_CLASS}
        >
          Next <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
