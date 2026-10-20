import {
  Button,
  formatDateTime,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@gift/ui'
import type { DealerStaffMember } from '@/lib/features/staff/types'
import { canDeactivate } from '@/lib/features/staff/roster'
import { StaffRoleBadge, StaffStatusBadge } from './StaffBadges'

/** `lastLoginAt: null` means "never signed in" here, not "unknown" — `formatDateTime`'s generic
 *  "Not provided" fallback would read as a data gap rather than the real, meaningful state. */
function lastSignIn(value: string | null): string {
  return value ? formatDateTime(value) : 'Never signed in'
}

export function StaffTable({
  members,
  onDeactivate,
}: {
  members: DealerStaffMember[]
  onDeactivate: (member: DealerStaffMember) => void
}) {
  return (
    <>
      <TableContainer className="hidden sm:block">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Last sign-in</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">Actions</span>
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium text-foreground">{member.name ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{member.email}</TableCell>
                <TableCell>
                  <StaffStatusBadge isActive={member.isActive} />
                </TableCell>
                <TableCell className="text-muted-foreground">{lastSignIn(member.lastLoginAt)}</TableCell>
                <TableCell className="text-right">
                  {canDeactivate(member) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onDeactivate(member)}
                      aria-label={`Deactivate ${member.email}`}
                    >
                      Deactivate
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <ul className="grid gap-3 sm:hidden">
        {members.map((member) => (
          <li key={member.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">{member.name ?? member.email}</p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
              <StaffRoleBadge role={member.role} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <StaffStatusBadge isActive={member.isActive} />
              <span className="text-sm text-muted-foreground">{lastSignIn(member.lastLoginAt)}</span>
            </div>
            {canDeactivate(member) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => onDeactivate(member)}
                aria-label={`Deactivate ${member.email}`}
              >
                Deactivate
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}
