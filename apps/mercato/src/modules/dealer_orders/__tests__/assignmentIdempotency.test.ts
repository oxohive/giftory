import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const ADMIN_ID = 'dddddddd-0000-4000-a000-000000000004'
const ORDER_ID = '11111111-0000-4000-a000-000000000011'
const DEALER_ID = 'cccccccc-0000-4000-a000-000000000003'
const DEALER_2 = 'cccccccc-0000-4000-a000-000000000033'
const ASSIGNMENT_ID = 'eeeeeeee-0000-4000-a000-000000000005'
const KEY = '7d6f2b1e-3c4a-4f5e-9a8b-1c2d3e4f5a6b'

/**
 * In-memory stand-in for the `dealer_order_idempotency_keys` table with the
 * same unique (tenant, org, key) rule, reachable through every `em.fork()`.
 */
type Row = Record<string, unknown> & { id: string }
const mockTable: { rows: Row[] } = { rows: [] }
let mockSeq = 0

function mockMatches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    const actual = row[k]
    if (v instanceof Date && actual instanceof Date) return v.getTime() === actual.getTime()
    return actual === v
  })
}

function mockMakeEm(): Record<string, unknown> {
  const pending: Row[] = []
  const em: Record<string, unknown> = {
    fork: () => mockMakeEm(),
    findOne: async (_entity: unknown, where: Record<string, unknown>) => {
      const row = mockTable.rows.find((r) => mockMatches(r, where))
      return row ? { ...row } : null
    },
    create: (_entity: unknown, data: Record<string, unknown>) => {
      const row = { id: `claim-${++mockSeq}`, ...data } as Row
      return row
    },
    persist: (row: Row) => {
      pending.push(row)
    },
    flush: async () => {
      for (const row of pending.splice(0)) {
        const dup = mockTable.rows.some(
          (r) => r.tenantId === row.tenantId && r.organizationId === row.organizationId && r.idempotencyKey === row.idempotencyKey,
        )
        if (dup) {
          throw Object.assign(new Error('duplicate key value violates unique constraint "dealer_order_idempotency_keys_scope_key_uniq"'), {
            code: '23505',
            constraint: 'dealer_order_idempotency_keys_scope_key_uniq',
          })
        }
        mockTable.rows.push({ ...row })
      }
    },
    nativeUpdate: async (_entity: unknown, where: Record<string, unknown>, data: Record<string, unknown>) => {
      let n = 0
      for (const r of mockTable.rows) {
        if (mockMatches(r, where)) {
          Object.assign(r, data)
          n++
        }
      }
      return n
    },
    nativeDelete: async (_entity: unknown, where: Record<string, unknown>) => {
      const before = mockTable.rows.length
      mockTable.rows = mockTable.rows.filter((r) => !mockMatches(r, where))
      return before - mockTable.rows.length
    },
  }
  return em
}

const mockExecute = jest.fn<(commandId: string, options: { input: Record<string, unknown> }) => Promise<{ result: unknown }>>()

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: async () => ({ sub: 'dddddddd-0000-4000-a000-000000000004', tenantId: 'aaaaaaaa-0000-4000-a000-000000000001', orgId: 'bbbbbbbb-0000-4000-a000-000000000002' }),
}))

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: async () => ({
    resolve: (id: string) => {
      if (id === 'em') return mockMakeEm()
      if (id === 'commandBus') return { execute: (...args: unknown[]) => mockExecute(...(args as [string, { input: Record<string, unknown> }])) }
      throw new Error(`Unknown service: ${id}`)
    },
  }),
}))

import { POST, PUT } from '../api/admin/orders/[id]/assignment/route'
import {
  ASSIGNMENT_CLAIM_STALE_MS,
  claimAssignmentKey,
  decideExistingClaim,
  hashAssignmentRequest,
  requireIdempotencyKey,
} from '../lib/idempotency'
import { DealerOrdersError } from '../lib/errors'
import { DEALER_ORDER_REASSIGN_COMMAND } from '../lib/constants'

const routeCtx = { params: { id: ORDER_ID } }
const futureDate = (() => {
  const d = new Date(Date.now() + 7 * 86400000)
  return d.toISOString().slice(0, 10)
})()

function request(method: 'POST' | 'PUT', body: unknown, key: string | null = KEY) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (key !== null) headers['Idempotency-Key'] = key
  return new Request(`http://localhost/api/dealer_orders/admin/orders/${ORDER_ID}/assignment`, {
    method,
    headers,
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mockTable.rows = []
  mockExecute.mockReset()
})

const translate = (_k: string, fallback: string) => fallback

describe('requireIdempotencyKey', () => {
  const req = (key?: string) => new Request('http://localhost/x', { method: 'POST', headers: key === undefined ? {} : { 'Idempotency-Key': key } })

  it('400 idempotency_key_required when absent or blank', () => {
    expect(() => requireIdempotencyKey(req(), translate)).toThrow(expect.objectContaining({ status: 400, code: 'idempotency_key_required' }))
    expect(() => requireIdempotencyKey(req('   '), translate)).toThrow(expect.objectContaining({ code: 'idempotency_key_required' }))
  })

  it('400 idempotency_key_invalid for keys outside the storefront format', () => {
    expect(() => requireIdempotencyKey(req('short'), translate)).toThrow(expect.objectContaining({ code: 'idempotency_key_invalid' }))
    expect(() => requireIdempotencyKey(req('has spaces in it 1234'), translate)).toThrow(DealerOrdersError)
  })

  it('accepts a UUID and the integration-test style `assign-<uuid>` key (trimmed)', () => {
    expect(requireIdempotencyKey(req(` ${KEY} `), translate)).toBe(KEY)
    expect(requireIdempotencyKey(req(`assign-${ORDER_ID}`), translate)).toBe(`assign-${ORDER_ID}`)
  })
})

describe('decideExistingClaim', () => {
  const now = new Date('2026-11-23T12:00:00.000Z')
  const base = { id: 'c1', operation: 'assign', requestHash: 'h1', status: 'completed', claimedAt: now, responseStatus: 201, responseBody: { id: ASSIGNMENT_ID } }

  it('replays a completed claim with the same payload', () => {
    expect(decideExistingClaim(base, 'assign', 'h1', now)).toEqual({ kind: 'replay', response: { status: 201, body: { id: ASSIGNMENT_ID } } })
  })

  it('mismatch for a different payload or operation, whatever the status', () => {
    expect(decideExistingClaim(base, 'assign', 'h2', now).kind).toBe('mismatch')
    expect(decideExistingClaim(base, 'reassign', 'h1', now).kind).toBe('mismatch')
    expect(decideExistingClaim({ ...base, status: 'processing', responseStatus: null }, 'assign', 'h2', now).kind).toBe('mismatch')
  })

  it('in_progress for a fresh processing claim, reclaim once stale', () => {
    const processing = { ...base, status: 'processing', responseStatus: null, responseBody: null }
    expect(decideExistingClaim({ ...processing, claimedAt: new Date(now.getTime() - 1000) }, 'assign', 'h1', now).kind).toBe('in_progress')
    expect(decideExistingClaim({ ...processing, claimedAt: new Date(now.getTime() - ASSIGNMENT_CLAIM_STALE_MS - 1) }, 'assign', 'h1', now).kind).toBe('reclaim')
  })
})

describe('claimAssignmentKey', () => {
  const scope = { tenantId: TENANT_ID, organizationId: ORG_ID }

  it('two concurrent claims for the same key: exactly one wins, the other is told it is in progress', async () => {
    const args = { em: mockMakeEm() as never, scope, idempotencyKey: KEY, operation: 'assign' as const, requestHash: 'h1', translate }
    const results = await Promise.allSettled([claimAssignmentKey(args), claimAssignmentKey(args)])
    expect(results.filter((r) => r.status === 'fulfilled' && r.value.kind === 'claimed')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ status: 409, code: 'idempotency_request_in_progress' })
    expect(mockTable.rows).toHaveLength(1)
  })

  it('keys are scoped by tenant + organization: the same key in another org is independent', async () => {
    await claimAssignmentKey({ em: mockMakeEm() as never, scope, idempotencyKey: KEY, operation: 'assign', requestHash: 'h1', translate })
    const other = await claimAssignmentKey({
      em: mockMakeEm() as never,
      scope: { tenantId: TENANT_ID, organizationId: 'bbbbbbbb-0000-4000-a000-0000000000ff' },
      idempotencyKey: KEY,
      operation: 'assign',
      requestHash: 'h-other',
      translate,
    })
    expect(other.kind).toBe('claimed')
  })

  it('takes over a stale processing claim (crashed request) exactly once', async () => {
    const stale = new Date(Date.now() - ASSIGNMENT_CLAIM_STALE_MS - 5000)
    mockTable.rows.push({ id: 'old', tenantId: TENANT_ID, organizationId: ORG_ID, idempotencyKey: KEY, operation: 'assign', requestHash: 'h1', status: 'processing', claimedAt: stale })
    const args = { em: mockMakeEm() as never, scope, idempotencyKey: KEY, operation: 'assign' as const, requestHash: 'h1', translate }
    const results = await Promise.allSettled([claimAssignmentKey(args), claimAssignmentKey(args)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ kind: string; claimId: string }>).value).toEqual({ kind: 'claimed', claimId: 'old' })
  })
})

describe('POST /admin/orders/:id/assignment — replay semantics', () => {
  const body = { dealerProfileId: DEALER_ID, requiredBy: futureDate }

  it('400 without the header; the command never runs', async () => {
    const res = await POST(request('POST', body, null), routeCtx)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'idempotency_key_required' })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('first use assigns once and stores the response; the same retry replays it without assigning again', async () => {
    mockExecute.mockResolvedValue({ result: { id: ASSIGNMENT_ID } })

    const first = await POST(request('POST', body), routeCtx)
    expect(first.status).toBe(201)
    expect(await first.json()).toEqual({ id: ASSIGNMENT_ID })
    expect(mockTable.rows[0]).toMatchObject({
      tenantId: TENANT_ID,
      organizationId: ORG_ID,
      idempotencyKey: KEY,
      operation: 'assign',
      requestHash: hashAssignmentRequest('assign', ORDER_ID, body),
      status: 'completed',
      responseStatus: 201,
      responseBody: { id: ASSIGNMENT_ID },
    })

    const second = await POST(request('POST', body), routeCtx)
    expect(second.status).toBe(201)
    expect(await second.json()).toEqual({ id: ASSIGNMENT_ID })
    expect(second.headers.get('Idempotent-Replayed')).toBe('true')
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('same key with a different dealer: 409 idempotency_key_reused, nothing executes', async () => {
    mockExecute.mockResolvedValue({ result: { id: ASSIGNMENT_ID } })
    await POST(request('POST', body), routeCtx)
    const res = await POST(request('POST', { ...body, dealerProfileId: DEALER_2 }), routeCtx)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'idempotency_key_reused' })
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('a failed command releases the key, so a corrected retry with the same key runs', async () => {
    mockExecute.mockRejectedValueOnce(new DealerOrdersError(400, 'request_failed', 'Order must be in paid status before it can be assigned'))
    const failed = await POST(request('POST', body), routeCtx)
    expect(failed.status).toBe(400)
    expect(mockTable.rows).toHaveLength(0)

    mockExecute.mockResolvedValueOnce({ result: { id: ASSIGNMENT_ID } })
    const retried = await POST(request('POST', { ...body, dealerProfileId: DEALER_2 }), routeCtx)
    expect(retried.status).toBe(201)
    expect(mockExecute).toHaveBeenCalledTimes(2)
  })

  it('a duplicate arriving while the first is still running gets 409 in_progress and does not execute', async () => {
    let release: () => void = () => undefined
    mockExecute.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ result: { id: ASSIGNMENT_ID } }) }),
    )
    const first = POST(request('POST', body), routeCtx)
    await new Promise((r) => setTimeout(r, 10))
    const dup = await POST(request('POST', body), routeCtx)
    expect(dup.status).toBe(409)
    expect(await dup.json()).toMatchObject({ code: 'idempotency_request_in_progress' })
    release()
    expect((await first).status).toBe(201)
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('body validation failures never touch the replay store', async () => {
    const res = await POST(request('POST', { dealerProfileId: 'nope', requiredBy: futureDate }), routeCtx)
    expect(res.status).toBe(422)
    expect(mockTable.rows).toHaveLength(0)
    expect(mockExecute).not.toHaveBeenCalled()
  })
})

describe('PUT /admin/orders/:id/assignment — a retried reassign does not reassign twice', () => {
  const body = { dealerProfileId: DEALER_2, requiredBy: futureDate, reason: 'Dealer unavailable' }

  it('replays the 200 for the same key + body', async () => {
    mockExecute.mockResolvedValue({ result: { id: ASSIGNMENT_ID } })
    const first = await PUT(request('PUT', body), routeCtx)
    expect(first.status).toBe(200)
    const second = await PUT(request('PUT', body), routeCtx)
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ id: ASSIGNMENT_ID })
    expect(second.headers.get('Idempotent-Replayed')).toBe('true')
    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(mockExecute.mock.calls[0][0]).toBe(DEALER_ORDER_REASSIGN_COMMAND)
  })

  it('a key used for assign cannot be replayed as a reassign', async () => {
    mockExecute.mockResolvedValue({ result: { id: ASSIGNMENT_ID } })
    await POST(request('POST', { dealerProfileId: DEALER_2, requiredBy: futureDate }), routeCtx)
    const res = await PUT(request('PUT', body), routeCtx)
    expect(res.status).toBe(409)
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })
})
