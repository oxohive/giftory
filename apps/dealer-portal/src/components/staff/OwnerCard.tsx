import type { DealerStaffMember } from '@/lib/features/staff/types'
import { StaffStatusBadge } from './StaffBadges'

/**
 * Read-only summary of the org's owner account(s). Never renders a Deactivate action — an owner
 * can never be deactivated through this app (see `lib/features/staff/roster.ts`'s `canDeactivate`
 * doc comment for why this is a backend-verified invariant, not a UI convenience).
 */
export function OwnerCard({ owners }: { owners: DealerStaffMember[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Account owner</h2>
      <ul className="mt-3 grid gap-2">
        {owners.map((owner) => (
          <li key={owner.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">{owner.name ?? owner.email}</p>
              <p className="text-sm text-muted-foreground">{owner.email}</p>
            </div>
            <StaffStatusBadge isActive={owner.isActive} />
          </li>
        ))}
      </ul>
    </div>
  )
}
