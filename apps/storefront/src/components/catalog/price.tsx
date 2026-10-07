import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

export function Price({
  minor,
  currency = 'INR',
  className,
  fallback = 'Price on request',
}: {
  minor: number | null | undefined
  currency?: string
  className?: string
  fallback?: string
}) {
  if (minor === null || minor === undefined) {
    return <span className={cn('text-muted-foreground', className)}>{fallback}</span>
  }
  return <span className={cn('tabular-nums', className)}>{formatMoney(minor, currency)}</span>
}
