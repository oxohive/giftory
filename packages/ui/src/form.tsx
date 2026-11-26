import * as LabelPrimitive from '@radix-ui/react-label'
import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { cn } from './cn'

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('text-sm font-medium text-foreground', className)} {...props} />
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
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
        'min-h-24 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
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
        'h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
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

/**
 * Label + control + hint/error, wired with ids for screen readers.
 *
 * When `children` is a single native control or one of this file's `Input`/`Select`/`Textarea`,
 * Field fills in `aria-describedby` (error, else hint) and `aria-invalid` on it unless the caller
 * already set them, so a control can't silently lose its error/hint association (WCAG 1.3.1,
 * 3.3.1). Custom composite controls must wire these themselves.
 */
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
  let control = children
  if (
    isValidElement(children) &&
    (typeof children.type === 'string' || children.type === Input || children.type === Select || children.type === Textarea)
  ) {
    const props = children.props as Record<string, unknown>
    const extra: Record<string, unknown> = {}
    const describedBy = fieldDescribedBy(id, error, Boolean(hint))
    if (props['aria-describedby'] === undefined && describedBy) extra['aria-describedby'] = describedBy
    if (props['aria-invalid'] === undefined && error) extra['aria-invalid'] = true
    if (Object.keys(extra).length > 0) control = cloneElement(children as ReactElement<Record<string, unknown>>, extra)
  }
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
      {control}
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

/**
 * After a submit fails client-side validation, move focus to the first invalid control so keyboard
 * and screen-reader users land on the problem instead of staying on the submit button (WCAG 3.3.1,
 * 2.4.3). Call it from the submit handler after setting the error state; it waits one frame so
 * React has committed the `aria-invalid` attributes.
 */
export function focusFirstInvalid(root: ParentNode | null | undefined): void {
  if (typeof window === 'undefined' || !root) return
  window.requestAnimationFrame(() => {
    root.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  })
}
