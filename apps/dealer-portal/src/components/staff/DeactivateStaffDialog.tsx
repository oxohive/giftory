'use client'

import { useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, ErrorNotice } from '@gift/ui'
import { deactivateStaffMember } from '@/lib/features/staff/api'
import { mapStaffDeactivateError, type StaffMutationError } from '@/lib/features/staff/errors'
import type { DealerStaffMember } from '@/lib/features/staff/types'

/**
 * Confirms the real consequence before calling `POST .../dealer/staff/{id}/deactivate`:
 * deactivation sets the installed auth module's `isConfirmed: false` on this user — the SAME
 * flag the auth module's session-integrity check re-validates on every authenticated request,
 * and the SAME flag `api/login.ts` refuses a fresh login against (`account_deactivated`). This is
 * a real, immediate access revocation, not a soft/cosmetic flag — the confirmation copy below
 * says so plainly rather than a generic "are you sure?".
 *
 * `member` is only ever a `dealer:staff` row that is currently active — `StaffTable` never wires
 * this dialog to an owner row or an already-deactivated row (`canDeactivate`,
 * `lib/features/staff/roster.ts`), which is also the real server-side guard
 * (`findDealerStaffUser` only ever resolves a `dealer:staff` user of the caller's own org; an
 * owner's own id never reaches here).
 */
export function DeactivateStaffDialog({
  member,
  onOpenChange,
  onDeactivated,
}: {
  member: DealerStaffMember | null
  onOpenChange: (open: boolean) => void
  onDeactivated: (member: DealerStaffMember) => void
}) {
  const [mutationError, setMutationError] = useState<StaffMutationError | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setMutationError(null)
      setSubmitting(false)
    }
    onOpenChange(next)
  }

  async function handleConfirm() {
    if (!member) return
    setMutationError(null)
    setSubmitting(true)
    try {
      await deactivateStaffMember(member.id)
      setSubmitting(false)
      onDeactivated(member)
    } catch (err) {
      setMutationError(mapStaffDeactivateError(err, 'Could not deactivate this staff member. Please try again.'))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={member !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate {member?.name ?? member?.email}?</DialogTitle>
          <DialogDescription>
            {member ? (
              <>
                This immediately revokes <strong>{member.email}</strong>&apos;s access — they will
                be signed out and will not be able to sign in again unless re-invited. This cannot
                be undone from this screen.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {mutationError ? <ErrorNotice message={mutationError.message} /> : null}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="danger" disabled={submitting} onClick={handleConfirm}>
            {submitting ? 'Deactivating…' : 'Deactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
