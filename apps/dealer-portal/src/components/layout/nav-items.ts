/**
 * Dealer portal navigation entries, frozen in tasks/phase-2-ui/CONTRACT-HANDOFF.md
 * ("Route groups" / "Navigation entries"): Dashboard / Orders / Profile / Staff (owner only) /
 * Earnings (owner only).
 *
 * This is UX only — hiding a link never substitutes for a server check. Every one of these
 * routes re-checks access server-side regardless of what's shown in the nav (shared acceptance
 * rule: "server authorization is required regardless of hidden navigation").
 */
export type DealerRole = 'dealer:owner' | 'dealer:staff'

export interface NavItem {
  href: string
  label: string
  /** Omitted = visible to every role. */
  rolesAllowed?: DealerRole[]
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/orders', label: 'Orders' },
  { href: '/profile', label: 'Profile' },
  { href: '/staff', label: 'Staff', rolesAllowed: ['dealer:owner'] },
  { href: '/earnings', label: 'Earnings', rolesAllowed: ['dealer:owner'] },
]

/**
 * Nav entries visible for a role. `role` of `null`/`undefined` means the session hasn't
 * resolved yet — show every entry rather than guessing, since (per the rule above) an extra
 * visible link that 403s server-side is harmless, while hiding "Earnings" from an owner during
 * a slow session fetch is a worse first impression than a flash of a link they can't use yet.
 */
export function visibleNavItems(role: DealerRole | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.rolesAllowed || !role || item.rolesAllowed.includes(role))
}
