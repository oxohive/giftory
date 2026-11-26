import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

jest.mock('@open-mercato/shared/lib/commands/scope', () => ({
  ensureTenantScope: () => undefined,
  ensureOrganizationScope: () => undefined,
}))

const mockEmit = jest.fn(async (_eventId: string, _payload: Record<string, unknown>) => undefined)
jest.mock('../events', () => ({ __esModule: true, default: { emit: (...args: unknown[]) => mockEmit(...(args as [string, Record<string, unknown>])) } }))

import {
  DEALER_LEDGER_LOCK_SQL,
  assertPayoutWithinBalance,
  dealerLedgerLockKey,
  executeCreateAdjustment,
  executeRecordPayout,
} from '../commands/entries'
import { DealerLedgerEntry, PayoutsIdempotencyKey } from '../data/entities'
import { DEALER_BALANCE_SQL } from '../lib/balance'
import { PayoutsError } from '../lib/errors'
import { isLedgerIdempotencyRaceError } from '../lib/idempotency'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const DEALER_ID = 'cccccccc-0000-4000-a000-000000000003'
const ADMIN_ID = 'dddddddd-0000-4000-a000-000000000004'
const KEY = '7d6f2b1e-3c4a-4f5e-9a8b-1c2d3e4f5a6b'
const HASH = 'a'.repeat(64)

type Created = { entity: unknown; data: Record<string, unknown> }

/**
 * Fake transactional EntityManager. Records the order of operations so the
 * tests can assert lock → idempotency check → balance → insert, and models a
 * rollback by not exposing persisted rows when the callback throws.
 */
function makeHarness(opts: {
  pendingAmount?: number
  consumedKey?: boolean
  flushError?: unknown
} = {}) {
  const calls: string[] = []
  const created: Created[] = []
  const persisted: unknown[] = []
  let committed = false
  const pending = opts.pendingAmount ?? 0
  const tem = {
    execute: jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql === DEALER_LEDGER_LOCK_SQL) {
        calls.push('lock')
        return [{}]
      }
      if (sql === DEALER_BALANCE_SQL) {
        calls.push('balance')
        return [{ total_earned: String(Math.max(pending, 0)), total_credited: String(Math.max(pending, 0)), total_debited: String(Math.max(-pending, 0)) }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }),
    findOne: jest.fn(async (entity: unknown, _where?: Record<string, unknown>) => {
      calls.push(entity === PayoutsIdempotencyKey ? 'findKey' : 'findOther')
      return opts.consumedKey ? { id: 'existing' } : null
    }),
    create: jest.fn((entity: unknown, data: Record<string, unknown>) => {
      created.push({ entity, data })
      return { ...data }
    }),
    persist: jest.fn((row: unknown) => {
      persisted.push(row)
    }),
    flush: jest.fn(async () => {
      calls.push('flush')
      if (opts.flushError) throw opts.flushError
    }),
  }
  const em = {
    transactional: jest.fn(async (cb: (t: typeof tem) => Promise<unknown>) => {
      calls.push('begin')
      try {
        const result = await cb(tem)
        committed = true
        calls.push('commit')
        return result
      } catch (err) {
        calls.push('rollback')
        throw err
      }
    }),
  }
  const ctx = {
    container: {
      resolve: jest.fn((id: string) => {
        if (id === 'em') return em
        throw new Error(`Unknown service: ${id}`)
      }),
    },
    auth: { sub: ADMIN_ID, tenantId: TENANT_ID, orgId: ORG_ID, isSuperAdmin: false },
    organizationScope: null,
    selectedOrganizationId: ORG_ID,
    organizationIds: [ORG_ID],
    systemActor: false,
  } as unknown as import('@open-mercato/shared/lib/commands').CommandRuntimeContext
  return { ctx, em, tem, calls, created, persisted, isCommitted: () => committed }
}

function payoutInput(amount: number, extra: Record<string, unknown> = {}) {
  return { dealerProfileId: DEALER_ID, amount, note: 'UTR123456789012', idempotencyKey: KEY, requestHash: HASH, ...extra }
}

function adjustmentInput(direction: 'credit' | 'debit', amount: number, extra: Record<string, unknown> = {}) {
  return { dealerProfileId: DEALER_ID, direction, amount, note: 'Correction for order #42', idempotencyKey: KEY, requestHash: HASH, ...extra }
}

beforeEach(() => {
  mockEmit.mockClear()
})

describe('assertPayoutWithinBalance', () => {
  const translate = (_k: string, fallback: string) => fallback

  it('allows a payout below the balance', () => {
    expect(() => assertPayoutWithinBalance({ pendingAmount: 10000 }, 9999, translate)).not.toThrow()
  })

  it('allows a payout of exactly the balance (leaves zero)', () => {
    expect(() => assertPayoutWithinBalance({ pendingAmount: 10000 }, 10000, translate)).not.toThrow()
  })

  it('rejects a payout one paisa over the balance with 422 insufficient_balance + amounts', () => {
    try {
      assertPayoutWithinBalance({ pendingAmount: 10000 }, 10001, translate)
      throw new Error('expected to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(PayoutsError)
      const e = err as PayoutsError
      expect(e.status).toBe(422)
      expect(e.code).toBe('insufficient_balance')
      expect(e.extra).toEqual({ availableAmount: 10000, requestedAmount: 10001 })
    }
  })

  it('rejects every payout when the balance is zero or negative', () => {
    expect(() => assertPayoutWithinBalance({ pendingAmount: 0 }, 1, translate)).toThrow(PayoutsError)
    expect(() => assertPayoutWithinBalance({ pendingAmount: -500 }, 1, translate)).toThrow(PayoutsError)
  })
})

describe('executeRecordPayout — balance guard + idempotency in one transaction', () => {
  it('takes the dealer lock, re-checks the key, checks the balance, then inserts entry + key row and commits', async () => {
    const h = makeHarness({ pendingAmount: 100000 })
    const entry = await executeRecordPayout(payoutInput(40000), h.ctx)

    expect(h.calls).toEqual(['begin', 'lock', 'findKey', 'balance', 'flush', 'commit'])
    expect(h.tem.execute).toHaveBeenCalledWith(DEALER_LEDGER_LOCK_SQL, [dealerLedgerLockKey(TENANT_ID, DEALER_ID)])
    expect(h.tem.findOne).toHaveBeenCalledWith(PayoutsIdempotencyKey, { tenantId: TENANT_ID, organizationId: ORG_ID, idempotencyKey: KEY })

    const ledgerRow = h.created.find((c) => c.entity === DealerLedgerEntry)!.data
    expect(ledgerRow).toMatchObject({
      dealerProfileId: DEALER_ID,
      tenantId: TENANT_ID,
      entryType: 'payout_disbursed',
      direction: 'debit',
      amount: '40000',
      referenceType: 'manual_payout',
      note: 'UTR123456789012',
      createdBy: ADMIN_ID,
    })
    expect(ledgerRow.referenceId).toBe(ledgerRow.id)

    const keyRow = h.created.find((c) => c.entity === PayoutsIdempotencyKey)!.data
    expect(keyRow).toMatchObject({
      tenantId: TENANT_ID,
      organizationId: ORG_ID,
      idempotencyKey: KEY,
      operation: 'record_payout',
      requestHash: HASH,
      ledgerEntryId: ledgerRow.id,
      responseStatus: 201,
      responseBody: { id: ledgerRow.id },
    })
    expect(h.persisted).toHaveLength(2)
    expect(entry.id).toBe(ledgerRow.id)
  })

  it('emits payouts.ledger_entry_created only after the transaction committed', async () => {
    const h = makeHarness({ pendingAmount: 100000 })
    mockEmit.mockImplementationOnce(async () => {
      expect(h.isCommitted()).toBe(true)
      return undefined
    })
    await executeRecordPayout(payoutInput(1000), h.ctx)
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith('payouts.ledger_entry_created', expect.objectContaining({ entryType: 'payout_disbursed', amount: 1000, direction: 'debit' }))
  })

  it('allows paying out the full balance', async () => {
    const h = makeHarness({ pendingAmount: 40000 })
    await expect(executeRecordPayout(payoutInput(40000), h.ctx)).resolves.toBeDefined()
  })

  it('rejects a payout above the balance: 422, nothing written, transaction rolled back, no event', async () => {
    const h = makeHarness({ pendingAmount: 40000 })
    await expect(executeRecordPayout(payoutInput(40001), h.ctx)).rejects.toMatchObject({
      status: 422,
      code: 'insufficient_balance',
      extra: { availableAmount: 40000, requestedAmount: 40001 },
    })
    expect(h.calls).toEqual(['begin', 'lock', 'findKey', 'balance', 'rollback'])
    expect(h.created).toHaveLength(0)
    expect(h.tem.flush).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('rejects any payout against a negative balance', async () => {
    const h = makeHarness({ pendingAmount: -100 })
    await expect(executeRecordPayout(payoutInput(1), h.ctx)).rejects.toMatchObject({ code: 'insufficient_balance' })
  })

  it('signals a race (no write, no balance check) when the key was consumed while waiting for the lock', async () => {
    const h = makeHarness({ pendingAmount: 100000, consumedKey: true })
    const err = await executeRecordPayout(payoutInput(1000), h.ctx).catch((e: unknown) => e)
    expect(isLedgerIdempotencyRaceError(err)).toBe(true)
    expect(h.calls).toEqual(['begin', 'lock', 'findKey', 'rollback'])
    expect(h.created).toHaveLength(0)
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('maps a unique violation on the idempotency constraint to a race signal (rolled back)', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key value violates unique constraint "payouts_idempotency_keys_scope_key_uniq"'), {
      code: '23505',
      constraint: 'payouts_idempotency_keys_scope_key_uniq',
    })
    const h = makeHarness({ pendingAmount: 100000, flushError: uniqueViolation })
    const err = await executeRecordPayout(payoutInput(1000), h.ctx).catch((e: unknown) => e)
    expect(isLedgerIdempotencyRaceError(err)).toBe(true)
    expect(h.calls[h.calls.length - 1]).toBe('rollback')
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('rethrows unrelated flush errors unchanged', async () => {
    const boom = new Error('connection reset')
    const h = makeHarness({ pendingAmount: 100000, flushError: boom })
    await expect(executeRecordPayout(payoutInput(1000), h.ctx)).rejects.toBe(boom)
  })

  it('refuses to run without the idempotency key and request hash supplied by the route', async () => {
    const h = makeHarness({ pendingAmount: 100000 })
    await expect(executeRecordPayout(payoutInput(1000, { idempotencyKey: undefined }), h.ctx)).rejects.toThrow()
    await expect(executeRecordPayout(payoutInput(1000, { requestHash: 'not-a-sha256' }), h.ctx)).rejects.toThrow()
    expect(h.em.transactional).not.toHaveBeenCalled()
  })
})

describe('executeCreateAdjustment', () => {
  it('writes an adjustment_credit under the dealer lock without a balance check', async () => {
    const h = makeHarness({ pendingAmount: 0 })
    await executeCreateAdjustment(adjustmentInput('credit', 5000), h.ctx)
    expect(h.calls).toEqual(['begin', 'lock', 'findKey', 'flush', 'commit'])
    const row = h.created.find((c) => c.entity === DealerLedgerEntry)!.data
    expect(row).toMatchObject({ entryType: 'adjustment_credit', direction: 'credit', amount: '5000', referenceType: 'adjustment' })
    const keyRow = h.created.find((c) => c.entity === PayoutsIdempotencyKey)!.data
    expect(keyRow).toMatchObject({ operation: 'create_adjustment', idempotencyKey: KEY })
  })

  it('allows an adjustment_debit larger than the balance (corrections may go negative)', async () => {
    const h = makeHarness({ pendingAmount: 100 })
    await executeCreateAdjustment(adjustmentInput('debit', 999999), h.ctx)
    expect(h.calls).not.toContain('balance')
    const row = h.created.find((c) => c.entity === DealerLedgerEntry)!.data
    expect(row).toMatchObject({ entryType: 'adjustment_debit', direction: 'debit', amount: '999999' })
  })

  it('signals a race when the key is already consumed', async () => {
    const h = makeHarness({ consumedKey: true })
    const err = await executeCreateAdjustment(adjustmentInput('credit', 5000), h.ctx).catch((e: unknown) => e)
    expect(isLedgerIdempotencyRaceError(err)).toBe(true)
    expect(h.created).toHaveLength(0)
  })
})
