import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { SalesOrder } from '@open-mercato/core/modules/sales/data/entities'
import type { PaymentGatewayService } from '@open-mercato/core/modules/payment_gateways/lib/gateway-service'
import { StorefrontCheckout } from '../data/entities'
import { emitStorefrontEvent } from '../events'
import {
  MONEY_TAKEN_STATUSES,
  ORDER_STATUS_WHEN_PAID,
  SALES_ORDER_STATUS_DICTIONARY_KEY,
  SALES_PAYMENT_STATUS_DICTIONARY_KEY,
} from './constants'
import { desiredSalesPaymentStatus, paidAmountOf } from './paymentState'
import type { StorefrontScope } from './scope'
import { executeCommand, findSalesDictionaryEntryId, systemCommandContext } from './system'

const logger = createLogger('storefront').child({ component: 'payment-sync' })

/**
 * Order payment state follows the gateway transaction.
 *
 * `payment_gateways` updates `GatewayTransaction.unifiedStatus` from webhooks,
 * the status poller and `getPaymentStatus` (e.g. the Razorpay confirm route) and
 * emits `payment_gateways.payment.*` events, but nothing in `sales` listens to
 * them. The storefront subscribers call `syncCheckoutPayment`, which:
 *  1. mirrors the unified status onto the checkout ledger (shown to shoppers);
 *  2. records ONE `sales.payments.create` once money is taken (captured), so
 *     the order's paid/outstanding totals are recomputed natively. It is not
 *     recorded on `authorized` because sales counts any payment as paid;
 *  3. marks a full refund on that payment via `sales.payments.update`;
 *  4. sets the order payment status (and `confirmed` once paid) via `sales.orders.update`.
 * Reads the transaction state instead of trusting the event payload, so it is
 * idempotent and converges whatever event (or retry) triggered it.
 */
export type PaymentSyncTrigger = { transactionId: string; tenantId: string; organizationId: string }

export async function syncCheckoutPayment(container: AppContainer, trigger: PaymentSyncTrigger): Promise<void> {
  const scope: StorefrontScope = { tenantId: trigger.tenantId, organizationId: trigger.organizationId }
  const em = (container.resolve('em') as EntityManager).fork()
  const checkout = await em.findOne(StorefrontCheckout, {
    gatewayTransactionId: trigger.transactionId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  } as FilterQuery<StorefrontCheckout>)
  if (!checkout || !checkout.orderId) return

  const gateway = container.resolve('paymentGatewayService') as PaymentGatewayService
  const transaction = await gateway.findTransaction(trigger.transactionId, scope)
  if (!transaction) return
  const unified = String(transaction.unifiedStatus)

  if (checkout.paymentStatus !== unified) {
    checkout.paymentStatus = unified
    await em.flush()
  }

  const order = await findOneWithDecryption(
    em,
    SalesOrder,
    { id: checkout.orderId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<SalesOrder>,
    undefined,
    scope,
  )
  if (!order) return
  const ctx = systemCommandContext(container, scope)

  if (MONEY_TAKEN_STATUSES.has(unified) && !checkout.salesPaymentId) {
    await recordSalesPayment(container, em, scope, checkout, order, transaction, unified)
  }

  if (unified === 'refunded' && checkout.salesPaymentId) {
    const refundedEntryId = await findSalesDictionaryEntryId(em, scope, SALES_PAYMENT_STATUS_DICTIONARY_KEY, 'refunded')
    await executeCommand(container, 'sales.payments.update', {
      id: checkout.salesPaymentId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      refundedAmount: paidAmountOf(transaction),
      ...(refundedEntryId ? { statusEntryId: refundedEntryId } : {}),
    }, ctx)
  }

  const desired = desiredSalesPaymentStatus(unified)
  const orderUpdate: Record<string, unknown> = {}
  if (desired && order.paymentStatus !== desired) {
    const entryId = await findSalesDictionaryEntryId(em, scope, SALES_PAYMENT_STATUS_DICTIONARY_KEY, desired)
    if (entryId) orderUpdate.paymentStatusEntryId = entryId
    else logger.warn('Sales payment status dictionary entry missing', { value: desired, tenantId: scope.tenantId })
  }
  if ((unified === 'captured' || unified === 'authorized') && !order.status) {
    const statusEntryId = await findSalesDictionaryEntryId(em, scope, SALES_ORDER_STATUS_DICTIONARY_KEY, ORDER_STATUS_WHEN_PAID)
    if (statusEntryId) orderUpdate.statusEntryId = statusEntryId
  }
  if (Object.keys(orderUpdate).length) {
    await executeCommand(container, 'sales.orders.update', { id: order.id, ...orderUpdate }, ctx)
  }

  await emitStorefrontEvent('storefront.order.payment_synced', {
    orderId: order.id,
    checkoutId: checkout.id,
    transactionId: trigger.transactionId,
    paymentStatus: unified,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  }).catch((err: unknown) => logger.warn('Failed to emit storefront.order.payment_synced', { err }))
}

async function recordSalesPayment(
  container: AppContainer,
  em: EntityManager,
  scope: StorefrontScope,
  checkout: StorefrontCheckout,
  order: SalesOrder,
  transaction: { id: string; providerKey: string; amount: unknown; capturedAmount: unknown; currencyCode: string },
  unified: string,
): Promise<void> {
  // Claim: only one delivery of one event may create the sales payment.
  const claimedAt = new Date()
  const claimed = await em.nativeUpdate(
    StorefrontCheckout,
    { id: checkout.id, paymentRecordedAt: null, salesPaymentId: null } as FilterQuery<StorefrontCheckout>,
    { paymentRecordedAt: claimedAt },
  )
  if (claimed === 0) return
  try {
    const amount = paidAmountOf(transaction)
    const statusEntryId = await findSalesDictionaryEntryId(
      em,
      scope,
      SALES_PAYMENT_STATUS_DICTIONARY_KEY,
      desiredSalesPaymentStatus(unified) ?? 'captured',
    )
    const result = await executeCommand<Record<string, unknown>, { id?: string; paymentId?: string }>(
      container,
      'sales.payments.create',
      {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        orderId: order.id,
        ...(order.paymentMethodId ? { paymentMethodId: order.paymentMethodId } : {}),
        paymentReference: `${transaction.providerKey}:${transaction.id}`.slice(0, 191),
        ...(statusEntryId ? { statusEntryId } : {}),
        amount,
        capturedAmount: amount,
        currencyCode: transaction.currencyCode.toUpperCase(),
        receivedAt: claimedAt,
        capturedAt: claimedAt,
        metadata: {
          source: 'storefront',
          checkoutId: checkout.id,
          gatewayTransactionId: transaction.id,
          providerKey: transaction.providerKey,
        },
      },
      systemCommandContext(container, scope),
    )
    const salesPaymentId = result?.id ?? result?.paymentId ?? null
    await em.nativeUpdate(StorefrontCheckout, { id: checkout.id } as FilterQuery<StorefrontCheckout>, {
      salesPaymentId,
      updatedAt: new Date(),
    })
    checkout.salesPaymentId = salesPaymentId
  } catch (err) {
    // Release the claim so the next event delivery / retry records the payment.
    await em.nativeUpdate(StorefrontCheckout, { id: checkout.id } as FilterQuery<StorefrontCheckout>, { paymentRecordedAt: null })
    throw err
  }
}
