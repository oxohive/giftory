'use client'

import { useState, type FormEvent } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorNotice,
  Field,
  Input,
  fieldDescribedBy,
} from '@gift/ui'
import { inviteStaffMember } from '@/lib/features/staff/api'
import { mapStaffInviteError, type StaffMutationError } from '@/lib/features/staff/errors'
import {
  buildInvitePayload,
  mergeFieldErrors,
  validateInviteForm,
  type InviteFormValues,
} from '@/lib/features/staff/validators'
import type { FieldErrors } from '@/lib/features/staff/types'

const EMPTY_VALUES: InviteFormValues = { email: '', name: '' }

/**
 * Invite-staff form, dialog-shelled. On success this calls `onInvited()` — the caller (
 * `StaffListView`) refetches the real `GET .../dealer/staff` roster rather than this component
 * painting the submitted email as a new row: the real invite response's `userId` cannot be
 * trusted as "the new row now exists with these exact fields" (see `lib/features/staff/errors.ts`'s
 * header comment on the response shape), and the established pattern in this app
 * (`CapabilitiesEditView`) is to always re-derive state from a server refetch after a mutation.
 */
export function InviteStaffDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvited: (email: string) => void
}) {
  const [values, setValues] = useState<InviteFormValues>(EMPTY_VALUES)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [mutationError, setMutationError] = useState<StaffMutationError | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setValues(EMPTY_VALUES)
    setFieldErrors({})
    setMutationError(null)
    setSubmitting(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setMutationError(null)

    const errors = validateInviteForm(values)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const payload = buildInvitePayload(values)
    setSubmitting(true)
    try {
      await inviteStaffMember(payload)
      const email = values.email.trim()
      reset()
      onOpenChange(false)
      onInvited(email)
    } catch (err) {
      const mapped = mapStaffInviteError(err, 'Could not send the invitation. Please try again.')
      setMutationError(mapped)
      if (mapped.kind === 'validation') {
        setFieldErrors((prev) => mergeFieldErrors(prev, mapped.details))
      }
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite staff</DialogTitle>
          <DialogDescription>
            They&apos;ll receive an email to set up their password and sign in with
            production-level (non-owner) access.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4" noValidate aria-busy={submitting}>
          {mutationError ? (
            <ErrorNotice
              message={
                mutationError.kind === 'duplicate_email'
                  ? 'Someone with this email already has an account. Use a different email address.'
                  : mutationError.message
              }
            />
          ) : null}

          <Field id="staff-invite-email" label="Email" required error={fieldErrors.email}>
            <Input
              id="staff-invite-email"
              type="email"
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              aria-describedby={fieldDescribedBy('staff-invite-email', fieldErrors.email)}
              aria-invalid={fieldErrors.email ? true : undefined}
              disabled={submitting}
              autoFocus
              required
            />
          </Field>

          <Field id="staff-invite-name" label="Name" hint="Optional" error={fieldErrors.name}>
            <Input
              id="staff-invite-name"
              type="text"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              aria-describedby={fieldDescribedBy('staff-invite-name', fieldErrors.name, true)}
              aria-invalid={fieldErrors.name ? true : undefined}
              disabled={submitting}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
