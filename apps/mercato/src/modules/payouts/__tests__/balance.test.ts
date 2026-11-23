import { describe, expect, it, jest } from '@jest/globals'
import { balanceFromRow, loadDealerBalance, DEALER_BALANCE_SQL, type DealerBalanceRow } from '../lib/balance'
import { computeLedgerBalanceFromEntries } from '../components/money'
import { ENTRY_TYPE_DIRECTION, ENTRY_TYPES, type EntryType } from '../lib/constants'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const DEALER_ID = 'cccccccc-0000-4000-a000-000000000003'

type Entry = { entryType: EntryType; amount: number }

/**
 * Reference implementation of the three SQL aggregates in DEALER_BALANCE_SQL,
 * evaluated over in-memory entries, producing the same string-typed row
 * shape Postgres returns for `SUM(bigint)` (numeric → string).
 */
function sqlRowFor(entries: Entry[]): DealerBalanceRow {
  let earned = 0
  let credited = 0
  let debited = 0
  for (const e of entries) {
    const direction = ENTRY_TYPE_DIRECTION[e.entryType]
    if (direction === 'credit' && e.entryType === 'commission_earned') earned += e.amount
    if (direction === 'credit') credited += e.amount
    if (direction === 'debit') debited += e.amount
  }
  return { total_earned: String(earned), total_credited: String(credited), total_debited: String(debited) }
}

describe('balanceFromRow — balance fields per entry type (Known gap #4)', () => {
  const cases: Array<{ name: string; entries: Entry[]; pendingAmount: number; totalEarned: number }> = [
    { name: 'empty ledger', entries: [], pendingAmount: 0, totalEarned: 0 },
    {
      name: 'commission credit raises pendingAmount AND totalEarned',
      entries: [{ entryType: 'commission_earned', amount: 100000 }],
      pendingAmount: 100000,
      totalEarned: 100000,
    },
    {
      name: 'payout lowers pendingAmount only',
      entries: [
        { entryType: 'commission_earned', amount: 100000 },
        { entryType: 'payout_disbursed', amount: 40000 },
      ],
      pendingAmount: 60000,
      totalEarned: 100000,
    },
    {
      name: 'adjustment credit raises pendingAmount only (was ignored before the fix)',
      entries: [
        { entryType: 'commission_earned', amount: 100000 },
        { entryType: 'adjustment_credit', amount: 5000 },
      ],
      pendingAmount: 105000,
      totalEarned: 100000,
    },
    {
      name: 'adjustment debit lowers pendingAmount only',
      entries: [
        { entryType: 'commission_earned', amount: 100000 },
        { entryType: 'adjustment_debit', amount: 15000 },
      ],
      pendingAmount: 85000,
      totalEarned: 100000,
    },
    {
      name: 'adjustment credit on its own (e.g. goodwill bonus) is payable',
      entries: [{ entryType: 'adjustment_credit', amount: 2500 }],
      pendingAmount: 2500,
      totalEarned: 0,
    },
    {
      name: 'adjustment debit can take the balance negative',
      entries: [
        { entryType: 'commission_earned', amount: 1000 },
        { entryType: 'adjustment_debit', amount: 3000 },
      ],
      pendingAmount: -2000,
      totalEarned: 1000,
    },
    {
      name: 'all four entry types together',
      entries: [
        { entryType: 'commission_earned', amount: 33333 },
        { entryType: 'commission_earned', amount: 66667 },
        { entryType: 'adjustment_credit', amount: 10000 },
        { entryType: 'payout_disbursed', amount: 50000 },
        { entryType: 'adjustment_debit', amount: 7000 },
      ],
      pendingAmount: 53000,
      totalEarned: 100000,
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const balance = balanceFromRow(sqlRowFor(c.entries))
      expect(balance.pendingAmount).toBe(c.pendingAmount)
      expect(balance.totalEarned).toBe(c.totalEarned)
      expect(balance.pendingAmount).toBe(balance.totalCredited - balance.totalDebited)
    })

    it(`${c.name} — the admin UI mirror (components/money.ts) agrees with the server`, () => {
      const mirror = computeLedgerBalanceFromEntries(
        c.entries.map((e) => ({ entryType: e.entryType, direction: ENTRY_TYPE_DIRECTION[e.entryType], amount: e.amount })),
      )
      expect(mirror.pendingAmount).toBe(c.pendingAmount)
      expect(mirror.totalEarned).toBe(c.totalEarned)
    })
  }

  it('covers every entry type the ledger knows about', () => {
    const covered = new Set(cases.flatMap((c) => c.entries.map((e) => e.entryType)))
    expect([...covered].sort()).toEqual([...ENTRY_TYPES].sort())
  })

  it('treats a missing row / null sums as zero', () => {
    expect(balanceFromRow(null)).toEqual({ pendingAmount: 0, totalEarned: 0, totalCredited: 0, totalDebited: 0 })
    expect(balanceFromRow({ total_earned: null, total_credited: null, total_debited: null }).pendingAmount).toBe(0)
  })

  it('accepts numeric values as well as numeric strings', () => {
    expect(balanceFromRow({ total_earned: 10, total_credited: 15, total_debited: 4 }).pendingAmount).toBe(11)
  })

  it('refuses to return an unsafe (precision-losing) integer', () => {
    expect(() => balanceFromRow({ total_earned: '0', total_credited: '9007199254740993', total_debited: '0' })).toThrow()
    expect(() => balanceFromRow({ total_earned: '0', total_credited: '12.5', total_debited: '0' })).toThrow()
  })
})

describe('loadDealerBalance', () => {
  it('runs the shared balance SQL scoped by tenant + dealer and maps the row', async () => {
    const execute = jest.fn(async (_sql: string, _params: unknown[]) => [{ total_earned: '100000', total_credited: '105000', total_debited: '40000' }])
    const balance = await loadDealerBalance({ execute } as never, TENANT_ID, DEALER_ID)
    expect(execute).toHaveBeenCalledWith(DEALER_BALANCE_SQL, [TENANT_ID, DEALER_ID])
    expect(balance).toEqual({ pendingAmount: 65000, totalEarned: 100000, totalCredited: 105000, totalDebited: 40000 })
  })

  it('the SQL sums every credit for pendingAmount, not only commission credits', () => {
    expect(DEALER_BALANCE_SQL).toMatch(/WHEN direction = 'credit' THEN amount::bigint ELSE 0 END\), 0\)\s+AS total_credited/)
    expect(DEALER_BALANCE_SQL).toMatch(/WHERE tenant_id = \? AND dealer_profile_id = \?/)
  })
})
