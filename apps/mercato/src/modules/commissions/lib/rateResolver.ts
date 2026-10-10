import type { EntityManager } from '@mikro-orm/postgresql'
import { CommissionRule } from '../data/entities.js'
import { MAX_RATE_BPS } from './constants.js'

export type ResolvedRate = {
  rateBps: number
  ruleId: string | null
}

/**
 * Resolves the commission rate for a given dealer + product type, using today as
 * the effective date. Priority (highest wins):
 *   1. dealer + product type  (most specific)
 *   2. dealer + null          (dealer default)
 *   3. null + null            (platform-wide default)
 *
 * Returns rateBps=0 and ruleId=null when no matching rule exists.
 * All queries are scoped to tenantId.
 */
export async function resolveCommissionRate(
  em: EntityManager,
  tenantId: string,
  dealerProfileId: string,
  productTypeCode: string | null,
  asOf: Date = new Date(),
): Promise<ResolvedRate> {
  const today = asOf.toISOString().slice(0, 10) // YYYY-MM-DD

  const findRule = async (dealerId: string | null, ptCode: string | null): Promise<CommissionRule | null> => {
    const rows = await em.getConnection().execute<Array<{ id: string; rate_bps: number }>>(
      `SELECT id, rate_bps FROM commission_rules
       WHERE tenant_id = ?
         AND (dealer_profile_id IS NOT DISTINCT FROM ?)
         AND (product_type_code IS NOT DISTINCT FROM ?)
         AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to > ?)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [tenantId, dealerId, ptCode, today, today],
    )
    if (!rows.length) return null
    const row = rows[0]
    const rule = em.getReference(CommissionRule, row.id)
    ;(rule as unknown as { rateBps: number }).rateBps = row.rate_bps
    return rule
  }

  // Priority 1: dealer + product type
  if (productTypeCode) {
    const rule = await findRule(dealerProfileId, productTypeCode)
    if (rule) return { rateBps: (rule as unknown as { rateBps: number }).rateBps, ruleId: rule.id }
  }

  // Priority 2: dealer default
  const dealerDefault = await findRule(dealerProfileId, null)
  if (dealerDefault) return { rateBps: (dealerDefault as unknown as { rateBps: number }).rateBps, ruleId: dealerDefault.id }

  // Priority 3: platform-wide default
  const platformDefault = await findRule(null, null)
  if (platformDefault) return { rateBps: (platformDefault as unknown as { rateBps: number }).rateBps, ruleId: platformDefault.id }

  return { rateBps: 0, ruleId: null }
}

/**
 * Computes commission amount in paise from subtotal and rate.
 * Formula: ROUND(subtotalAmount * rateBps / 10000)
 * Uses integer arithmetic only — no floating point.
 */
export function computeCommissionAmount(subtotalAmountPaise: number, rateBps: number): number {
  if (rateBps < 0 || rateBps > MAX_RATE_BPS) throw new Error(`rateBps ${rateBps} out of range [0, ${MAX_RATE_BPS}]`)
  // Multiply first to avoid precision loss, then integer divide with round.
  return Math.round((subtotalAmountPaise * rateBps) / 10_000)
}
