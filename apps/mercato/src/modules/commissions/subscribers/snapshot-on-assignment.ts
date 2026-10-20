import { createLogger } from '@open-mercato/shared/lib/logger'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { COMMISSION_SNAPSHOT_CREATE_COMMAND } from '../lib/constants'

const logger = createLogger('commissions').child({ component: 'snapshot-on-assignment' })

export const metadata = {
  event: 'dealer_order.assigned',
  persistent: true,
}

export type DealerOrderAssignedPayload = {
  id: string
  orderId: string
  dealerProfileId: string
  tenantId: string
  organizationId: string
  requiredBy: string
  assignedBy: string
}

type ResolverContext = { resolve: <T>(name: string) => T }

/**
 * Triggered when a dealer order assignment is created. Fetches the order
 * subtotal (INR paise) via raw SQL and creates a commission snapshot via the
 * COMMISSION_SNAPSHOT_CREATE_COMMAND. This keeps the commission module
 * decoupled — no cross-module ORM relations.
 */
export default async function onDealerOrderAssigned(
  payload: DealerOrderAssignedPayload,
  _ctx: ResolverContext,
): Promise<void> {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<{ getConnection: () => { execute: (sql: string, params: unknown[]) => Promise<Array<{ subtotal_net_amount: string }>> } }>('em')

    // `sales_orders` is the real table — see `dealer_orders/lib/orderDetails.ts`'s
    // identical raw-SQL precedent against the sales module's own tables (this
    // module never imports `SalesOrder`/`SalesOrderLine`; cross-module ORM
    // relations are banned per root CLAUDE.md). The original query referenced
    // `orders`/`order_lines`/`gifts`, none of which exist in this schema, so
    // every real order assignment silently failed this query and was swallowed
    // by the catch block below — no commission snapshot was ever created.
    //
    // Column is `subtotal_net_amount`, not `subtotal_amount` — `sales_orders`
    // has no column named `subtotal_amount` (confirmed against
    // `@open-mercato/core`'s `sales` module entity, which only defines
    // `subtotal_net_amount`/`subtotal_gross_amount`). A prior version of this
    // query selected the nonexistent `subtotal_amount`, which threw inside the
    // try/catch below on every real assignment — the exact same silent-failure
    // shape as the `orders`-table bug above, just one layer deeper. FEAT-012's
    // own spec (`spec/phase-2/features/FEAT-012-commission-engine.md`) defines
    // commission as a percentage of the subtotal "excluding platform fees,
    // shipping, and tax" — i.e. the NET subtotal, not the tax-inclusive gross.
    //
    // `product_type_code` is deliberately NOT selected here — see the doc
    // comment below for why.
    const rows = await em.getConnection().execute(
      `SELECT subtotal_net_amount FROM sales_orders WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [payload.orderId, payload.tenantId],
    )

    if (!rows.length) {
      logger.warn('commission snapshot skipped — order not found', { orderId: payload.orderId, tenantId: payload.tenantId })
      return
    }

    const row = rows[0]
    const subtotalAmount = parseInt(String(row.subtotal_net_amount ?? '0'), 10)

    const commandBus = container.resolve<CommandBus>('commandBus')
    const ctx: CommandRuntimeContext = {
      container,
      auth: {
        tenantId: payload.tenantId,
        orgId: payload.organizationId,
        sub: 'system',
        isSuperAdmin: false,
      } as CommandRuntimeContext['auth'],
      organizationScope: null,
      selectedOrganizationId: payload.organizationId,
      organizationIds: [payload.organizationId],
      systemActor: true,
      request: null as unknown as Request,
    }

    await commandBus.execute(COMMISSION_SNAPSHOT_CREATE_COMMAND, {
      input: {
        assignmentId: payload.id,
        orderId: payload.orderId,
        dealerProfileId: payload.dealerProfileId,
        subtotalAmount,
        // GENUINE GAP (documented, not a guess): there is no canonical
        // per-product "type" classification anywhere in this schema yet that
        // a `sales_order_lines` row could be joined to. Investigated and
        // ruled out:
        //   - `catalog_products.product_type` is the catalog's STRUCTURAL
        //     type (simple/configurable/virtual/downloadable/bundle/grouped)
        //     — an unrelated concept, not a gift category.
        //   - `gift_catalog`'s `GiftProductProfile` carries occasions/
        //     recipientTypes/fulfillmentMode etc., but no singular "type"
        //     field tied to a product.
        //   - `catalog_product_categories` is a full hierarchical tree (and
        //     a product may have multiple category assignments) — not a
        //     scalar code, and nothing wires a category slug to this field.
        //   - `dealer_capabilities.productTypeCodes` and `commission_rules.
        //     productTypeCode` are each independent free text with their own
        //     ad hoc examples (`'mug'`/`'tshirt'` vs. `'personalized-mugs'`)
        //     and no FK or shared vocabulary tying them to each other or to
        //     a product. FEAT-012's commission engine shipped ahead of a
        //     real product-type taxonomy existing.
        // `rateResolver.ts` already treats `null` as "no product-type-
        // specific rule applies — fall through to dealer-default or
        // platform-wide", so this is the correct, explicit resolution until
        // a human decides what the real taxonomy (and its link to a product)
        // should be — not something to invent here.
        productTypeCode: null,
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
      },
      ctx,
    })

    logger.info('commission snapshot created', {
      assignmentId: payload.id,
      orderId: payload.orderId,
      dealerProfileId: payload.dealerProfileId,
    })
  } catch (err) {
    logger.error('commission snapshot failed', {
      assignmentId: payload.id,
      orderId: payload.orderId,
      err,
    })
  }
}
