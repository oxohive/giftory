'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '@gift/api-client'
import type { AssignmentStatus } from '@gift/api-client'
import { Button, ErrorNotice, Field, Textarea } from '@gift/ui'
import { classifyOrderDetailError, isTerminalStatus, nextStatusFor, updateOrderStatus } from '@/lib/features/orders/detail'

/** The action label for the one real forward transition available from each non-terminal status. */
const TRANSITION_LABEL: Record<AssignmentStatus, string> = {
  assigned: 'Acknowledge order',
  acknowledged: 'Start production',
  in_production: 'Mark ready for dispatch',
  ready_for_dispatch: 'Mark dispatched',
  dispatched: '',
  cancelled: '',
}

/**
 * The status-update action (`POST .../dealer/orders/{id}/status`). Only ever offers the ONE
 * forward transition `nextStatusFor` computes from the assignment's current status — there is no
 * free-form status picker, so this component cannot construct a request for a transition the
 * backend's real `DEALER_STATUS_TRANSITIONS` graph doesn't allow. The backend remains the actual
 * gate (see `detail.ts`'s doc comment on `updateOrderStatus`); every failure path below still
 * surfaces a clear, specific message rather than letting the button appear to do nothing.
 *
 * `onUpdated` is awaited and is expected to re-fetch the assignment from the server (the parent's
 * `refreshFromServer`, which invalidates the detail query) — this component never applies the new
 * status to its own local state, satisfying "refresh after successful mutation; not an
 * optimistic-only update."
 */
export function StatusUpdateForm({
  assignmentId,
  status,
  updatedAt,
  onUpdated,
}: {
  assignmentId: string
  status: AssignmentStatus
  updatedAt: string | null
  onUpdated: () => Promise<unknown>
}) {
  const [note, setNote] = useState('')

  const next = nextStatusFor(status)

  const mutation = useMutation({
    mutationFn: (targetStatus: AssignmentStatus) =>
      updateOrderStatus(assignmentId, { status: targetStatus, note, updatedAt: updatedAt ?? undefined }),
    onSuccess: async () => {
      setNote('')
      await onUpdated()
    },
  })

  // Once the parent refreshes from the server (a new `status`/`updatedAt` landed), any previous
  // error no longer describes the current state — clear it rather than leaving a stale banner
  // up after a successful recovery (e.g. refetch-after-conflict).
  useEffect(() => {
    mutation.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, updatedAt])

  if (isTerminalStatus(status) || !next) {
    return status === 'dispatched' ? (
      <p className="text-sm text-muted-foreground">This order has been dispatched. No further action is needed.</p>
    ) : null
  }

  const errorKind = mutation.error ? classifyOrderDetailError(mutation.error) : null
  const isConflict = errorKind === 'conflict'
  const errorMessage = (() => {
    if (!errorKind) return null
    if (errorKind === 'conflict') {
      return 'This order was updated elsewhere since you loaded it. Refresh to see the latest status before trying again.'
    }
    if (errorKind === 'invalid_transition') {
      return mutation.error instanceof ApiError
        ? mutation.error.message
        : 'That status change is not allowed from the current status.'
    }
    if (errorKind === 'not_found') {
      return 'This assignment could no longer be found — it may have been cancelled or reassigned. Refresh to see its current state.'
    }
    if (errorKind === 'unauthorized' || errorKind === 'forbidden') {
      // Handled by the parent view's own 401/403 branches on the page-level query; this
      // mutation-level banner is defense-in-depth should the session lapse mid-edit.
      return mutation.error instanceof ApiError ? mutation.error.message : 'You no longer have permission to do this.'
    }
    return 'Something went wrong updating the status. Please try again.'
  })()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!next) return
    mutation.mutate(next)
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-lg border border-border bg-surface p-4" aria-busy={mutation.isPending}>
      <h2 className="text-sm font-semibold text-foreground">Update production status</h2>

      {errorMessage ? (
        <ErrorNotice message={errorMessage} onRetry={isConflict || errorKind === 'not_found' ? () => onUpdated() : undefined} />
      ) : null}

      <Field
        id="status-note"
        label="Note (optional)"
        hint="Visible on this order only. A new note replaces the previous one — notes are not kept as a history."
      >
        <Textarea id="status-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={mutation.isPending} />
      </Field>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Updating…' : TRANSITION_LABEL[status]}
      </Button>
    </form>
  )
}
