import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { GiftOccasion } from '../data/entities'
import { DEFAULT_GIFT_OCCASIONS } from './constants'
import type { GiftCatalogScope } from '../commands/shared'

/**
 * Idempotently seeds the default occasion lookup rows for one organization.
 *
 * Reference data, like the catalog's own unit/price-kind seeds: rows that
 * already exist (live OR soft-deleted) are left untouched so staff edits and
 * deliberate deletions survive re-running `seed:defaults`. Returns the number
 * of rows inserted.
 */
export async function ensureDefaultGiftOccasions(em: EntityManager, scope: GiftCatalogScope): Promise<number> {
  const existing = await em.find(GiftOccasion, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  } as FilterQuery<GiftOccasion>)
  const existingCodes = new Set(existing.map((row) => row.code))
  let inserted = 0
  const now = new Date()
  for (const seed of DEFAULT_GIFT_OCCASIONS) {
    if (existingCodes.has(seed.code)) continue
    em.persist(
      em.create(GiftOccasion, {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        code: seed.code,
        label: seed.label,
        description: seed.description,
        sortOrder: seed.sortOrder,
        isActive: true,
        imageUrl: null,
        createdAt: now,
        updatedAt: now,
      }),
    )
    inserted += 1
  }
  if (inserted > 0) await em.flush()
  return inserted
}
