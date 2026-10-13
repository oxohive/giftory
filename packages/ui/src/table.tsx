import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

/** Wrap `<Table>` so wide tables scroll horizontally inside their own box, never the page. */
export function TableContainer({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('w-full overflow-x-auto rounded-lg border border-border', className)}>{children}</div>
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />
}

export function TableHead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-surface-muted text-left', className)} {...props} />
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('hover:bg-surface-muted/60', className)} {...props} />
}

export function TableHeaderCell({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="col" className={cn('px-4 py-3 text-xs font-semibold text-muted-foreground', className)} {...props} />
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />
}

/** A full-width row for a table's loading/empty/error state, so callers don't reimplement colSpan plumbing. */
export function TableStateRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10">
        {children}
      </td>
    </tr>
  )
}
