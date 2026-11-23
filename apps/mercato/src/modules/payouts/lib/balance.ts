import type { EntityManager } from '@mikro-orm/postgresql'

/**
 * Dealer ledger balance — the single source of the balance formula for every
 * server-side consumer (both balance routes and the payout balance guard).
 *
 * FEAT-013 "Balance View":
 *
 *   pendingAmount = Σ amount WHERE direction = 'credit'
 *                 − Σ amount WHERE direction = 'debit'
 *
 * i.e. every credit (`commission_earned`, `adjustment_credit`) increases the
 * amount still owed to the dealer and every debit (`payout_disbursed`,
 * `adjustment_debit`) decreases it. `totalEarned` stays "lifetime commission
 * earned": Σ `commission_earned` credits only — adjustments are corrections,
 * not earnings, and payouts never reduce it.
 *
 * Before this module existed the routes computed
 * `pendingAmount = totalEarned − totalDebited`, which silently ignored
 * `adjustment_credit` (Known gap #4 in docs/dealer-marketplace-api.md).
 *
 * All amounts are integer paise; Postgres sums them as `numeric` and the
 * values come back as strings, which are parsed to safe integers here.
 */

export const DEALER_BALANCE_SQL = `SELECT
       COALESCE(SUM(CASE WHEN direction = 'credit' AND entry_type = 'commission_earned' THEN amount::bigint ELSE 0 END), 0) AS total_earned,
       COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount::bigint ELSE 0 END), 0)                                       AS total_credited,
       COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount::bigint ELSE 0 END), 0)                                        AS total_debited
     FROM dealer_ledger_entries
     WHERE tenant_id = ? AND dealer_profile_id = ?`

export type DealerBalanceRow = {
  total_earned: string | number | null
  total_credited: string | number | null
  total_debited: string | number | null
}

export type DealerLedgerBalance = {
  /** Owed to the dealer right now: Σ credits − Σ debits (paise). May be negative. */
  pendingAmount: number
  /** Lifetime commission earned: Σ `commission_earned` credits (paise). */
  totalEarned: number
  /** Σ of every credit, commissions and adjustment credits (paise). */
  totalCredited: number
  /** Σ of every debit, payouts and adjustment debits (paise). */
  totalDebited: number
}

function toSafeInteger(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('[internal] payouts ledger sum is not a safe integer')
  }
  return parsed
}

export function balanceFromRow(row: DealerBalanceRow | null | undefined): DealerLedgerBalance {
  const totalEarned = toSafeInteger(row?.total_earned)
  const totalCredited = toSafeInteger(row?.total_credited)
  const totalDebited = toSafeInteger(row?.total_debited)
  return {
    pendingAmount: totalCredited - totalDebited,
    totalEarned,
    totalCredited,
    totalDebited,
  }
}

/**
 * Reads the balance with the given EntityManager. When `em` is the
 * transactional fork inside `em.transactional(...)`, the query runs on that
 * transaction's connection (SqlEntityManager.execute picks up the active
 * transaction context) — the payout guard relies on that.
 */
export async function loadDealerBalance(
  em: Pick<EntityManager, 'execute'>,
  tenantId: string,
  dealerProfileId: string,
): Promise<DealerLedgerBalance> {
  const rows = await em.execute<DealerBalanceRow[]>(DEALER_BALANCE_SQL, [tenantId, dealerProfileId])
  return balanceFromRow(Array.isArray(rows) ? rows[0] : null)
}
