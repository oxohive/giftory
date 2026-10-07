import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

/** Label + control + hint/error, wired with ids for screen readers. */
export function Field({
  id,
  label,
  error,
  hint,
  required,
  className,
  children,
}: {
  id: string
  label: ReactNode
  error?: string
  hint?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** aria-describedby value for a Field's control. */
export function describedBy(id: string, error?: string, hasHint?: boolean): string | undefined {
  if (error) return `${id}-error`
  if (hasHint) return `${id}-hint`
  return undefined
}
