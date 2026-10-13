import { describe, expect, it, jest } from '@jest/globals'

/**
 * Regression coverage for the `dealer_order.assigned` subscriber — the
 * subscriber that actually freezes a commission snapshot the moment an order
 * is assigned to a dealer (see `docs/phase-2-status.md`).
 *
 * Before this fix, the subscriber's raw SQL queried tables that do not exist
 * in this schema (`orders`, `order_lines`, `gifts` — guessed names, never the
 * real `sales_orders`/`sales_order_lines`), so every real assignment threw
 * inside the try/catch and the commission snapshot was silently never
 * created, with the downstream ledger-crediting subscriber never firing
 * either. This test exercises the REAL contract end to end:
 *   - the real subscriber (`../snapshot-on-assignment`) against a mocked `em`
 *     whose `getConnection().execute` only recognizes the REAL table names
 *     (`sales_orders`, `commission_rules`) — any query against the old
 *     guessed tables (`orders`, `order_lines`, `gifts`) throws, so a
 *     regression back to the old SQL fails this test for a functional
 *     reason, not a string-match on the query text.
 *   - the REAL `COMMISSION_SNAPSHOT_CREATE_COMMAND` handler, registered via
 *     `registerCommand` exactly as production does (imported, not
 *     reimplemented) and invoked through a fake `commandBus.execute` that
 *     delegates to the real registered handler — proving the subscriber's
 *     SQL result is correctly turned into a real commission snapshot via the
 *     real rate-resolution waterfall in `lib/rateResolver.ts`.
 *
 * This repo's Jest config is unit-only (no live Postgres wiring — see
 * `jest.config.cjs`'s own comment and the equivalent note in
 * `components/__tests__/realAssignmentPrecedence.test.ts`), so "real
 * contract fixtures" here means: fixture rows shaped exactly like what `pg`
 * actually returns for these real columns (e.g. `subtotal_amount` as a
 * decimal string), fed through the unmodified production command handler —
 * not a mock of the subscriber's own internals and not an assertion that a
 * SQL string merely "looks right".
 */

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

const mockCreateRequestContainer = jest.fn()
jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: mockCreateRequestContainer,
}))

import { commandRegistry } from '@open-mercato/shared/lib/commands'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { COMMISSION_SNAPSHOT_CREATE_COMMAND } from '../../lib/constants'
import { computeCommissionAmount } from '../../lib/rateResolver'
// Importing this file registers the REAL COMMISSION_SNAPSHOT_CREATE_COMMAND
// handler used in production (via `registerCommand`), exactly as the app's
// module bootstrap would.
import '../../commands/snapshots'
import onDealerOrderAssigned, { type DealerOrderAssignedPayload } from '../snapshot-on-assignment'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const DEALER_PROFILE_ID = 'cccccccc-0000-4000-a000-000000000003'
const ORDER_ID = 'dddddddd-0000-4000-a000-000000000004'
const ASSIGNMENT_ID = 'eeeeeeee-0000-4000-a000-000000000005'
const PLATFORM_RULE_ID = 'ffffffff-0000-4000-a000-000000000006'
const DEALER_RULE_ID = '11111111-0000-4000-a000-000000000007'

const SUBTOTAL_PAISE = 125_000 // a realistic ₹1,250.00 order
const PLATFORM_RATE_BPS = 500 // 5%
const DEALER_DEFAULT_RATE_BPS = 800 // 8%

const payload: DealerOrderAssignedPayload = {
  id: ASSIGNMENT_ID,
  orderId: ORDER_ID,
  dealerProfileId: DEALER_PROFILE_ID,
  tenantId: TENANT_ID,
  organizationId: ORG_ID,
  requiredBy: '2026-10-20',
  assignedBy: 'staff-user-1',
}

type RuleFixture = { dealerProfileId: string | null; productTypeCode: string | null; id: string; rateBps: number }

/**
 * A fixture `em.getConnection().execute` that only understands the REAL
 * tables (`sales_orders`, `commission_rules`). It mirrors the exact
 * WHERE-clause contract of `lib/rateResolver.ts`'s real SQL (`IS NOT
 * DISTINCT FROM` matching on dealer id / product type code) rather than
 * re-asserting the query text. Any query against a table this schema does
 * not have (the OLD buggy `orders`/`order_lines`/`gifts`) throws, so a
 * regression back to the old guessed table names fails this test because
 * the subscriber functionally gets no data back — not because a string
 * literal changed.
 */
function makeExecuteMock(opts: { orderRow?: { subtotal_amount: string } | null; rules?: RuleFixture[] }) {
  // `opts.orderRow === undefined` means "not passed, use the default row";
  // an explicit `null` means "simulate no matching sales_orders row" — `??`
  // would collapse both cases together, so check explicitly.
  const orderRow = opts.orderRow !== undefined ? opts.orderRow : { subtotal_amount: String(SUBTOTAL_PAISE) }
  const rules = opts.rules ?? []
  return jest.fn(async (sql: string, params: unknown[]): Promise<Array<Record<string, unknown>>> => {
    if (/FROM\s+sales_orders\b/i.test(sql)) {
      const [orderId, tenantId] = params
      if (orderId !== ORDER_ID || tenantId !== TENANT_ID) return []
      return orderRow ? [orderRow] : []
    }
    if (/FROM\s+commission_rules\b/i.test(sql)) {
      const [tenantId, dealerId, productTypeCode] = params as [string, string | null, string | null]
      if (tenantId !== TENANT_ID) return []
      const match = rules.find((r) => r.dealerProfileId === dealerId && r.productTypeCode === productTypeCode)
      return match ? [{ id: match.id, rate_bps: match.rateBps }] : []
    }
    // The OLD buggy query referenced `orders`, `order_lines`, `gifts` — none
    // of those exist in this fixture, matching the real schema.
    throw new Error(`Unexpected SQL against a nonexistent table: ${sql}`)
  })
}

function makeEm(executeMock: ReturnType<typeof makeExecuteMock>) {
  return {
    getConnection: () => ({ execute: executeMock }),
    // `rateResolver.ts` calls `em.getReference(CommissionRule, row.id)` then
    // sets `.rateBps` on the returned reference — a plain object with the id
    // is enough to satisfy that.
    getReference: jest.fn((_entityClass: unknown, id: string) => ({ id })),
  }
}

function makeDataEngine() {
  return {
    createOrmEntity: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'snapshot-fixture-id',
      snapshottedAt: new Date('2026-10-13T00:00:00Z'),
      ...data,
    })),
  }
}

/** Delegates to the REAL registered command handler — not a reimplementation. */
function makeCommandBus() {
  return {
    execute: jest.fn(async (commandId: string, options: { input: unknown; ctx: CommandRuntimeContext }) => {
      const handler = commandRegistry.get(commandId)
      if (!handler) throw new Error(`Command handler not registered: ${commandId}`)
      const result = await handler.execute(options.input, options.ctx)
      return { result, logEntry: null }
    }),
  }
}

function makeContainer(
  em: ReturnType<typeof makeEm>,
  dataEngine: ReturnType<typeof makeDataEngine>,
  commandBus: ReturnType<typeof makeCommandBus>,
) {
  return {
    resolve: jest.fn((id: string) => {
      if (id === 'em') return em
      if (id === 'dataEngine') return dataEngine
      if (id === 'commandBus') return commandBus
      throw new Error(`Unknown service: ${id}`)
    }),
  }
}

describe('snapshot-on-assignment — real sales_orders/sales_order_lines contract', () => {
  it('reads subtotal from the real sales_orders table and creates a real commission snapshot via COMMISSION_SNAPSHOT_CREATE_COMMAND, falling back to the platform-default rate', async () => {
    const executeMock = makeExecuteMock({
      rules: [
        { dealerProfileId: null, productTypeCode: null, id: PLATFORM_RULE_ID, rateBps: PLATFORM_RATE_BPS },
      ],
    })
    const em = makeEm(executeMock)
    const dataEngine = makeDataEngine()
    const commandBus = makeCommandBus()
    const container = makeContainer(em, dataEngine, commandBus)
    mockCreateRequestContainer.mockResolvedValue(container)

    await onDealerOrderAssigned(payload, { resolve: () => undefined as never })

    // The subscriber queried the real table, not the nonexistent guessed ones.
    expect(executeMock).toHaveBeenCalled()
    const sqlTexts = executeMock.mock.calls.map(([sql]) => sql as string)
    expect(sqlTexts.some((sql) => /FROM\s+sales_orders\b/i.test(sql))).toBe(true)
    expect(sqlTexts.some((sql) => /\border_lines\b|\bgifts\b|FROM\s+orders\b/i.test(sql))).toBe(false)

    // It invoked the real command with the correctly parsed subtotal and an
    // explicit (not fabricated) null product type.
    expect(commandBus.execute).toHaveBeenCalledTimes(1)
    const [commandId, callOptions] = commandBus.execute.mock.calls[0] as [string, { input: Record<string, unknown> }]
    expect(commandId).toBe(COMMISSION_SNAPSHOT_CREATE_COMMAND)
    expect(callOptions.input).toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      orderId: ORDER_ID,
      dealerProfileId: DEALER_PROFILE_ID,
      subtotalAmount: SUBTOTAL_PAISE,
      productTypeCode: null,
      tenantId: TENANT_ID,
      organizationId: ORG_ID,
    })

    // The REAL command handler resolved the platform-default rule (no
    // dealer-specific rule exists in this fixture) and froze a real snapshot.
    expect(dataEngine.createOrmEntity).toHaveBeenCalledTimes(1)
    const [createArgs] = dataEngine.createOrmEntity.mock.calls[0] as [{ data: Record<string, unknown> }]
    expect(createArgs.data).toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      orderId: ORDER_ID,
      dealerProfileId: DEALER_PROFILE_ID,
      tenantId: TENANT_ID,
      subtotalAmount: SUBTOTAL_PAISE,
      commissionRateBps: PLATFORM_RATE_BPS,
      commissionAmount: computeCommissionAmount(SUBTOTAL_PAISE, PLATFORM_RATE_BPS),
      ruleId: PLATFORM_RULE_ID,
    })
  })

  it('prefers the dealer-specific default rule over the platform default when both exist, even with no product-type match', async () => {
    const executeMock = makeExecuteMock({
      rules: [
        { dealerProfileId: null, productTypeCode: null, id: PLATFORM_RULE_ID, rateBps: PLATFORM_RATE_BPS },
        { dealerProfileId: DEALER_PROFILE_ID, productTypeCode: null, id: DEALER_RULE_ID, rateBps: DEALER_DEFAULT_RATE_BPS },
      ],
    })
    const em = makeEm(executeMock)
    const dataEngine = makeDataEngine()
    const commandBus = makeCommandBus()
    const container = makeContainer(em, dataEngine, commandBus)
    mockCreateRequestContainer.mockResolvedValue(container)

    await onDealerOrderAssigned(payload, { resolve: () => undefined as never })

    const [createArgs] = dataEngine.createOrmEntity.mock.calls[0] as [{ data: Record<string, unknown> }]
    expect(createArgs.data).toMatchObject({
      commissionRateBps: DEALER_DEFAULT_RATE_BPS,
      commissionAmount: computeCommissionAmount(SUBTOTAL_PAISE, DEALER_DEFAULT_RATE_BPS),
      ruleId: DEALER_RULE_ID,
    })
  })

  it('records a 0-paise commission with no ruleId when no rule matches at all — real waterfall, real fallback', async () => {
    const executeMock = makeExecuteMock({ rules: [] })
    const em = makeEm(executeMock)
    const dataEngine = makeDataEngine()
    const commandBus = makeCommandBus()
    const container = makeContainer(em, dataEngine, commandBus)
    mockCreateRequestContainer.mockResolvedValue(container)

    await onDealerOrderAssigned(payload, { resolve: () => undefined as never })

    const [createArgs] = dataEngine.createOrmEntity.mock.calls[0] as [{ data: Record<string, unknown> }]
    expect(createArgs.data).toMatchObject({
      commissionRateBps: 0,
      commissionAmount: 0,
      ruleId: null,
    })
  })

  it('skips creating a snapshot (and never throws) when the order is not found in sales_orders', async () => {
    const executeMock = makeExecuteMock({ orderRow: null })
    const em = makeEm(executeMock)
    const dataEngine = makeDataEngine()
    const commandBus = makeCommandBus()
    const container = makeContainer(em, dataEngine, commandBus)
    mockCreateRequestContainer.mockResolvedValue(container)

    await onDealerOrderAssigned(payload, { resolve: () => undefined as never })

    expect(commandBus.execute).not.toHaveBeenCalled()
    expect(dataEngine.createOrmEntity).not.toHaveBeenCalled()
  })

  it('parses a realistic decimal-string subtotal_amount (as pg returns numeric columns) into an integer paise amount', async () => {
    const executeMock = makeExecuteMock({
      orderRow: { subtotal_amount: '999999' },
      rules: [{ dealerProfileId: null, productTypeCode: null, id: PLATFORM_RULE_ID, rateBps: PLATFORM_RATE_BPS }],
    })
    const em = makeEm(executeMock)
    const dataEngine = makeDataEngine()
    const commandBus = makeCommandBus()
    const container = makeContainer(em, dataEngine, commandBus)
    mockCreateRequestContainer.mockResolvedValue(container)

    await onDealerOrderAssigned(payload, { resolve: () => undefined as never })

    const [, callOptions] = commandBus.execute.mock.calls[0] as [string, { input: Record<string, unknown> }]
    expect(callOptions.input.subtotalAmount).toBe(999_999)
    expect(typeof callOptions.input.subtotalAmount).toBe('number')
  })
})
