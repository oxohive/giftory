import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const DEALER_ID = 'cccccccc-0000-4000-a000-000000000003'
const ADMIN_ID = 'dddddddd-0000-4000-a000-000000000004'
const ENTRY_ID = 'eeeeeeee-0000-4000-a000-000000000005'
const KEY = '7d6f2b1e-3c4a-4f5e-9a8b-1c2d3e4f5a6b'

const mockFindOne = jest.fn<(entity: unknown, where: Record<string, unknown>) => Promise<unknown>>()
const mockExecute = jest.fn<(commandId: string, options: { input: Record<string, unknown> }) => Promise<{ result: unknown }>>()

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: async () => ({ sub: ADMIN_ID, tenantId: TENANT_ID, orgId: ORG_ID }),
}))

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: async () => {
    const em = {
      findOne: (...args: unknown[]) => mockFindOne(...(args as [unknown, Record<string, unknown>])),
      fork: () => em,
    }
    return {
      resolve: (id: string) => {
        if (id === 'em') return em
        if (id === 'commandBus') return { execute: (...args: unknown[]) => mockExecute(...(args as [string, { input: Record<string, unknown> }])) }
        throw new Error(`Unknown service: ${id}`)
      },
    }
  },
}))

import { POST as postPayout } from '../api/admin/dealers/[id]/ledger/payout/route'
import { POST as postAdjustment } from '../api/admin/dealers/[id]/ledger/adjustment/route'
import { PayoutsError } from '../lib/errors'
import { LedgerIdempotencyRaceError, hashLedgerRequest } from '../lib/idempotency'

const routeCtx = { params: { id: DEALER_ID } }

function request(path: string, body: unknown, key: string | null = KEY) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (key !== null) headers['Idempotency-Key'] = key
  return new Request(`http://localhost/api/payouts/admin/dealers/${DEALER_ID}/ledger/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function storedRow(operation: string, requestHash: string) {
  return { operation, requestHash, responseStatus: 201, responseBody: { id: ENTRY_ID } }
}

beforeEach(() => {
  mockFindOne.mockReset()
  mockExecute.mockReset()
})

describe('POST .../ledger/payout — Idempotency-Key required', () => {
  it('400 idempotency_key_required when the header is missing; nothing executes', async () => {
    const res = await postPayout(request('payout', { amount: 1000, note: 'UTR1' }, null), routeCtx)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'idempotency_key_required' })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('400 idempotency_key_invalid for a malformed key (same rules as storefront checkout)', async () => {
    const res = await postPayout(request('payout', { amount: 1000, note: 'UTR1' }, 'short'), routeCtx)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'idempotency_key_invalid' })
    expect(mockExecute).not.toHaveBeenCalled()
  })
})

describe('POST .../ledger/payout — replay semantics', () => {
  const body = { amount: 40000, note: 'UTR123456789012' }
  const hash = hashLedgerRequest('record_payout', DEALER_ID, body)

  it('first use: runs the command with the key + request hash and session scope, returns 201 {id}', async () => {
    mockFindOne.mockResolvedValue(null)
    mockExecute.mockResolvedValue({ result: { id: ENTRY_ID } })

    const res = await postPayout(request('payout', { ...body, tenantId: 'ffffffff-0000-4000-a000-000000000009' }), routeCtx)

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: ENTRY_ID })
    expect(res.headers.get('Idempotent-Replayed')).toBeNull()
    expect(mockFindOne).toHaveBeenCalledWith(expect.anything(), { tenantId: TENANT_ID, organizationId: ORG_ID, idempotencyKey: KEY })
    expect(mockExecute).toHaveBeenCalledTimes(1)
    const [commandId, options] = mockExecute.mock.calls[0]
    expect(commandId).toBe('payouts.ledger.record_payout')
    expect(options.input).toMatchObject({ dealerProfileId: DEALER_ID, amount: 40000, idempotencyKey: KEY, requestHash: hash })
    expect(options.input.tenantId).toBeUndefined()
  })

  it('same key + same payload: replays the stored 201 without executing again', async () => {
    mockFindOne.mockResolvedValue(storedRow('record_payout', hash))

    const res = await postPayout(request('payout', body), routeCtx)

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: ENTRY_ID })
    expect(res.headers.get('Idempotent-Replayed')).toBe('true')
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('payload normalisation: a note differing only by surrounding whitespace is the same request', async () => {
    mockFindOne.mockResolvedValue(storedRow('record_payout', hash))
    const res = await postPayout(request('payout', { amount: 40000, note: '  UTR123456789012  ' }), routeCtx)
    expect(res.status).toBe(201)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('same key + different amount: 409 idempotency_key_reused, nothing executes', async () => {
    mockFindOne.mockResolvedValue(storedRow('record_payout', hash))

    const res = await postPayout(request('payout', { ...body, amount: 40001 }), routeCtx)

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'idempotency_key_reused' })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('same key previously used on the adjustment route: 409, nothing executes', async () => {
    mockFindOne.mockResolvedValue(storedRow('create_adjustment', hash))
    const res = await postPayout(request('payout', body), routeCtx)
    expect(res.status).toBe(409)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('concurrent duplicate: the command reports the key was consumed meanwhile → replays the winner', async () => {
    mockFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(storedRow('record_payout', hash))
    mockExecute.mockRejectedValue(new LedgerIdempotencyRaceError())

    const res = await postPayout(request('payout', body), routeCtx)

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: ENTRY_ID })
    expect(res.headers.get('Idempotent-Replayed')).toBe('true')
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('concurrent request with the same key but a different body: 409 after the race', async () => {
    mockFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(storedRow('record_payout', 'b'.repeat(64)))
    mockExecute.mockRejectedValue(new LedgerIdempotencyRaceError())
    const res = await postPayout(request('payout', body), routeCtx)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'idempotency_key_reused' })
  })

  it('insufficient balance surfaces as 422 with the available amount', async () => {
    mockFindOne.mockResolvedValue(null)
    mockExecute.mockRejectedValue(
      new PayoutsError(422, 'insufficient_balance', 'Payout amount exceeds the dealer balance', { availableAmount: 39999, requestedAmount: 40000 }),
    )
    const res = await postPayout(request('payout', body), routeCtx)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'insufficient_balance', availableAmount: 39999, requestedAmount: 40000 })
  })

  it('a body that fails validation is 422 and never touches the replay store', async () => {
    const res = await postPayout(request('payout', { amount: 0, note: 'UTR1' }), routeCtx)
    expect(res.status).toBe(422)
    expect(mockFindOne).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
  })
})

describe('POST .../ledger/adjustment — Idempotency-Key required + replay', () => {
  const body = { direction: 'credit' as const, amount: 5000, note: 'Goodwill credit' }
  const hash = hashLedgerRequest('create_adjustment', DEALER_ID, body)

  it('400 when the header is missing', async () => {
    const res = await postAdjustment(request('adjustment', body, null), routeCtx)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'idempotency_key_required' })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('first use executes the adjustment command with the key + hash', async () => {
    mockFindOne.mockResolvedValue(null)
    mockExecute.mockResolvedValue({ result: { id: ENTRY_ID } })
    const res = await postAdjustment(request('adjustment', body), routeCtx)
    expect(res.status).toBe(201)
    expect(mockExecute.mock.calls[0][0]).toBe('payouts.ledger.create_adjustment')
    expect(mockExecute.mock.calls[0][1].input).toMatchObject({ direction: 'credit', idempotencyKey: KEY, requestHash: hash })
  })

  it('replays the same adjustment without executing', async () => {
    mockFindOne.mockResolvedValue(storedRow('create_adjustment', hash))
    const res = await postAdjustment(request('adjustment', body), routeCtx)
    expect(res.status).toBe(201)
    expect(res.headers.get('Idempotent-Replayed')).toBe('true')
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('same key with the opposite direction is a different request: 409', async () => {
    mockFindOne.mockResolvedValue(storedRow('create_adjustment', hash))
    const res = await postAdjustment(request('adjustment', { ...body, direction: 'debit' }), routeCtx)
    expect(res.status).toBe(409)
    expect(mockExecute).not.toHaveBeenCalled()
  })
})
