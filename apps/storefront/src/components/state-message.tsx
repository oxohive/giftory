import { AlertTriangle, PackageOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Empty / error states with a consistent look. */
export function StateMessage({
  kind = 'empty',
  title,
  children,
  action,
  className,
}: {
  kind?: 'empty' | 'error'
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const Icon = kind === 'error' ? AlertTriangle : PackageOpen
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          kind === 'error' ? 'bg-danger/10 text-danger' : 'bg-secondary text-primary',
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="max-w-md text-sm text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
