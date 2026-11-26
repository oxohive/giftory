import { AlertTriangle, Inbox, Loader2, LogIn, ShieldOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

type HeadingLevel = 1 | 2 | 3 | 4

const HEADING_TAGS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const

/**
 * An empty list/collection — "nothing here yet", not an error.
 *
 * `headingLevel` keeps the page outline intact (WCAG 1.3.1/2.4.6): 2 (default) directly under a
 * page's h1, 3 inside an h2 section, 1 when the empty state IS the page (e.g. not-found).
 */
export function EmptyState({
  title,
  icon,
  action,
  className,
  children,
  headingLevel = 2,
}: {
  title: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
  children?: ReactNode
  headingLevel?: HeadingLevel
}) {
  const Heading = HEADING_TAGS[headingLevel]
  return (
    <div
      className={cn(
        'grid place-items-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <div className="text-muted-foreground" aria-hidden="true">
        {icon ?? <Inbox className="size-8" />}
      </div>
      <Heading className="text-base font-semibold text-foreground">{title}</Heading>
      {children ? <p className="max-w-sm text-sm text-muted-foreground">{children}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

/** A request failed. `onRetry`, when given, renders a retry action. */
export function ErrorNotice({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn('flex items-start gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-foreground', className)}
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
      <div className="grid gap-2">
        <p>{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="justify-self-start rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** A region that is still loading. `aria-live` tells screen readers it's in progress. */
export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

/** The caller's session is valid but they lack the feature grant for this screen (403). */
export function PermissionDenied({
  message = "You don't have permission to view this.",
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <div role="alert" className={cn('grid place-items-center gap-3 rounded-lg border border-border bg-surface-muted px-6 py-12 text-center', className)}>
      <ShieldOff className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

/** The session expired (401). `onSignIn`, when given, renders a sign-in action. */
export function SessionExpired({
  onSignIn,
  className,
  headingLevel = 2,
}: {
  onSignIn?: () => void
  className?: string
  headingLevel?: HeadingLevel
}) {
  const Heading = HEADING_TAGS[headingLevel]
  return (
    <div role="alert" className={cn('grid place-items-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center', className)}>
      <LogIn className="size-8 text-muted-foreground" aria-hidden="true" />
      <Heading className="text-base font-semibold text-foreground">Your session has ended</Heading>
      <p className="max-w-sm text-sm text-muted-foreground">Sign in again to keep going.</p>
      {onSignIn ? (
        <button
          type="button"
          onClick={onSignIn}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Sign in
        </button>
      ) : null}
    </div>
  )
}
