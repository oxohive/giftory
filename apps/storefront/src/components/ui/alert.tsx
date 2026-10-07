import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const styles = {
  info: { icon: Info, className: 'border-border bg-surface-muted' },
  success: { icon: CheckCircle2, className: 'border-success/40 bg-success/10' },
  warning: { icon: AlertTriangle, className: 'border-warning/60 bg-warning/15' },
  error: { icon: XCircle, className: 'border-danger/40 bg-danger/10' },
} as const

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof styles
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const { icon: Icon, className: toneClass } = styles[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border p-4 text-sm text-foreground', toneClass, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="grid gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  )
}
