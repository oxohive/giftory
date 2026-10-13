import * as LabelPrimitive from '@radix-ui/react-label'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('text-sm font-medium text-foreground', className)} {...props} />
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Checkbox({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 rounded border border-input text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  )
}

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
export function fieldDescribedBy(id: string, error?: string, hasHint?: boolean): string | undefined {
  if (error) return `${id}-error`
  if (hasHint) return `${id}-hint`
  return undefined
}
