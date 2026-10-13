import type { ComponentProps } from 'react'
import { cn } from './cn'
import { statusLabel, statusTone, type StatusTone } from './status-tone'

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-secondary text-secondary-foreground',
  info: 'bg-accent text-accent-foreground',
  warning: 'bg-warning text-warning-foreground',
  success: 'bg-success text-success-foreground',
  danger: 'bg-danger text-danger-foreground',
}

export function StatusBadge({
  value,
  className,
  ...props
}: { value: string; className?: string } & Omit<ComponentProps<'span'>, 'className'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        TONE_CLASSES[statusTone(value)],
        className,
      )}
      {...props}
    >
      {statusLabel(value)}
    </span>
  )
}
