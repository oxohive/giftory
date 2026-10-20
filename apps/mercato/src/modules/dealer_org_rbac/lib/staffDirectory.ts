import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Role, User, UserRole } from '@open-mercato/core/modules/auth/data/entities'
import { DEALER_OWNER_ROLE, DEALER_STAFF_ROLE } from './constants'

/**
 * Reads the dealer org's owner + staff roster using the INSTALLED auth
 * module's own entities — never a hand-rolled users table. `email` is
 * encrypted at rest (per-row IV, see `@open-mercato/core/modules/auth`'s
 * entity comment), so this deliberately uses `findWithDecryption` rather
 * than raw SQL; a raw `SELECT email FROM users` would return ciphertext.
 */

export type DealerOrgRole = typeof DEALER_OWNER_ROLE | typeof DEALER_STAFF_ROLE

export type DealerOrgUser = {
  id: string
  email: string
  name: string | null
  role: DealerOrgRole
  /** Mirrors `User.isConfirmed` — the SAME flag `auth.users.update` flips and
   * the SAME flag the auth module's session-integrity check re-validates on
   * every request (see `deactivateDealerStaffUser`'s doc comment). */
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string | null
}

function toIso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null
}

async function roleIdByName(em: EntityManager, tenantId: string, name: string): Promise<string | null> {
  const role = await em.findOne(Role, { tenantId, name, deletedAt: null } as FilterQuery<Role>)
  return role ? String(role.id) : null
}

/** The dealer org's owner + staff roster, scoped to one organization+tenant. */
export async function listDealerOrgUsers(
  em: EntityManager,
  organizationId: string,
  tenantId: string,
): Promise<DealerOrgUser[]> {
  const [ownerRoleId, staffRoleId] = await Promise.all([
    roleIdByName(em, tenantId, DEALER_OWNER_ROLE),
    roleIdByName(em, tenantId, DEALER_STAFF_ROLE),
  ])
  const roleIds = [ownerRoleId, staffRoleId].filter((id): id is string => id !== null)
  if (!roleIds.length) return []

  const users = await findWithDecryption<User>(
    em,
    User,
    { organizationId, tenantId, deletedAt: null } as FilterQuery<User>,
    { orderBy: { createdAt: 'asc' } as never },
    { tenantId, organizationId },
  )
  if (!users.length) return []

  const userIds = users.map((u) => String(u.id))
  const links = await em.find(
    UserRole,
    { user: { $in: userIds }, role: { $in: roleIds }, deletedAt: null } as FilterQuery<UserRole>,
  )

  const roleIdByUserId = new Map<string, string>()
  for (const link of links) {
    // Unpopulated ManyToOne relations are hydrated as a reference exposing
    // only `.id` — read that explicitly rather than `String(link.user)`,
    // which would stringify the entity instance, not its id.
    const userId = String((link as unknown as { user: { id: string } }).user.id)
    const roleId = String((link as unknown as { role: { id: string } }).role.id)
    // Only keep the first owner/staff role link seen per user — a dealer
    // org user is expected to hold exactly one of the two roles.
    if (!roleIdByUserId.has(userId)) roleIdByUserId.set(userId, roleId)
  }

  const out: DealerOrgUser[] = []
  for (const user of users) {
    const linkedRoleId = roleIdByUserId.get(String(user.id))
    if (!linkedRoleId) continue // not a dealer:owner/dealer:staff user — exclude from the roster
    const role: DealerOrgRole = linkedRoleId === ownerRoleId ? DEALER_OWNER_ROLE : DEALER_STAFF_ROLE
    out.push({
      id: String(user.id),
      email: user.email,
      name: user.name ?? null,
      role,
      isActive: user.isConfirmed !== false,
      lastLoginAt: toIso(user.lastLoginAt ?? null),
      createdAt: toIso(user.createdAt ?? null),
    })
  }
  return out
}

/**
 * Resolves a specific user id as a dealer:staff member of this org — returns
 * `null` for a different org's user, a dealer:owner, or an unknown id. Used
 * by `deactivateDealerStaffUser` to fail closed: an owner can only ever
 * target a `dealer:staff` user within their OWN org, never another owner and
 * never a user outside their org (even one with a plausible-looking id).
 */
export async function findDealerStaffUser(
  em: EntityManager,
  organizationId: string,
  tenantId: string,
  userId: string,
): Promise<DealerOrgUser | null> {
  const roster = await listDealerOrgUsers(em, organizationId, tenantId)
  return roster.find((u) => u.id === userId && u.role === DEALER_STAFF_ROLE) ?? null
}
