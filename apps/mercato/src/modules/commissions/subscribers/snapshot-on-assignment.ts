import { createLogger } from '@open-mercato/shared/lib/logger'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { COMMISSION_SNAPSHOT_CREATE_COMMAND } from '../lib/constants.js'

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
    const em = container.resolve<{ getConnection: () => { execute: (sql: string, params: unknown[]) => Promise<Array<{ subtotal_amount: string; product_type_code?: string | null }>> } }>('em')

    const rows = await em.getConnection().execute(
      `SELECT o.subtotal_amount,
              (SELECT product_type FROM gifts WHERE id = (
                SELECT item_id FROM order_lines WHERE order_id = o.id LIMIT 1
              ) LIMIT 1) AS product_type_code
       FROM orders o
       WHERE o.id = ? AND o.tenant_id = ?
       LIMIT 1`,
      [payload.orderId, payload.tenantId],
    )

    if (!rows.length) {
      logger.warn('commission snapshot skipped — order not found', { orderId: payload.orderId, tenantId: payload.tenantId })
      return
    }

    const row = rows[0]
    const subtotalAmount = parseInt(String(row.subtotal_amount ?? '0'), 10)

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
        productTypeCode: row.product_type_code ?? null,
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
