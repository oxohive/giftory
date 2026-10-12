import { createLogger } from '@open-mercato/shared/lib/logger'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { PAYOUTS_LEDGER_CREDIT_COMMISSION_COMMAND } from '../lib/constants'

const logger = createLogger('payouts').child({ component: 'credit-on-snapshot' })

export const metadata = {
  event: 'commission.snapshot_created',
  persistent: true,
}

export type CommissionSnapshotCreatedPayload = {
  id: string
  assignmentId: string
  orderId: string
  dealerProfileId: string
  tenantId: string
  commissionAmount: number
  rateBps: number
}

type ResolverContext = { resolve: <T>(name: string) => T }

/**
 * Creates a commission_earned credit entry in the payout ledger whenever a
 * commission snapshot is created. This runs as a persistent event subscriber
 * so the ledger stays in sync without coupling the commissions and payouts
 * modules at the ORM level.
 */
export default async function onCommissionSnapshotCreated(
  payload: CommissionSnapshotCreatedPayload,
  _ctx: ResolverContext,
): Promise<void> {
  try {
    const container = await createRequestContainer()
    const commandBus = container.resolve<CommandBus>('commandBus')

    const ctx: CommandRuntimeContext = {
      container,
      auth: {
        tenantId: payload.tenantId,
        orgId: payload.tenantId,
        sub: 'system',
        isSuperAdmin: false,
      } as CommandRuntimeContext['auth'],
      organizationScope: null,
      selectedOrganizationId: payload.tenantId,
      organizationIds: [payload.tenantId],
      systemActor: true,
      request: null as unknown as Request,
    }

    await commandBus.execute(PAYOUTS_LEDGER_CREDIT_COMMISSION_COMMAND, {
      input: {
        dealerProfileId: payload.dealerProfileId,
        snapshotId: payload.id,
        commissionAmount: payload.commissionAmount,
        tenantId: payload.tenantId,
        organizationId: payload.tenantId,
      },
      ctx,
    })

    logger.info('ledger credit entry created for commission snapshot', {
      snapshotId: payload.id,
      dealerProfileId: payload.dealerProfileId,
      commissionAmount: payload.commissionAmount,
    })
  } catch (err) {
    logger.error('failed to create ledger credit entry', {
      snapshotId: payload.id,
      dealerProfileId: payload.dealerProfileId,
      err,
    })
  }
}
