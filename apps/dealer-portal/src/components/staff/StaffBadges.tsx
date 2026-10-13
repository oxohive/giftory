import { cn } from '@gift/ui'
import type { DealerRole } from '@/lib/features/staff/types'

/**
 * Small, local status/role badges for the staff roster. Not added to `@gift/ui`'s `StatusBadge`
 * on purpose: that component's tone map (`status-tone.ts`) is keyed to the real
 * `dealer_onboarding.kycStatus` / `dealer_orders` assignment-status enums — "active"/
 * "deactivated" and "owner"/"staff" are a different, smaller vocabulary specific to this page,
 * and this task's owned paths do not include `packages/ui`.
 */
export function StaffStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        isActive ? 'bg-success text-success-foreground' : 'bg-danger text-danger-foreground',
      )}
    >
      {isActive ? 'Active' : 'Deactivated'}
    </span>
  )
}

export function StaffRoleBadge({ role }: { role: DealerRole }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        role === 'dealer:owner' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground',
      )}
    >
      {role === 'dealer:owner' ? 'Owner' : 'Staff'}
    </span>
  )
}
