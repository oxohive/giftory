import type { EntityManager } from '@mikro-orm/postgresql'
import type { JobContext, QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { IntegrationLogService } from '@open-mercato/core/modules/integrations/lib/log-service'
import type { PaymentGatewayService } from '@open-mercato/core/modules/payment_gateways/lib/gateway-service'
import {
  processPaymentGatewayWebhookJob,
  type PaymentGatewayWebhookJobPayload,
} from '@open-mercato/core/modules/payment_gateways/lib/webhook-processor'
import { RAZORPAY_WEBHOOK_QUEUE } from '../lib/queue'

type HandlerContext = JobContext & {
  resolve: <T = unknown>(name: string) => T
}

export const metadata: WorkerMeta = {
  queue: RAZORPAY_WEBHOOK_QUEUE,
  id: 'gateway-razorpay:webhook-processor',
  concurrency: 5,
}

/**
 * Processes verified Razorpay webhook jobs enqueued by `/api/payment_gateways/webhook/razorpay`
 * when QUEUE_STRATEGY=async. Delegates to the host processor, which is exactly what the route
 * runs inline in sync mode, so both paths share the same guarantees:
 * - drops jobs without the trusted `inbound-webhook` dispatch origin,
 * - takes tenant scope only from the signature-verified transaction, never from the payload,
 * - atomically claims `x-razorpay-event-id` (idempotencyKey) before any state change and
 *   releases the claim on failure so the queue retry can re-run it,
 * - maps status via the Razorpay adapter's `mapStatus` and applies only valid transitions.
 */
export default async function handle(job: QueuedJob<PaymentGatewayWebhookJobPayload>, ctx: HandlerContext): Promise<void> {
  await processPaymentGatewayWebhookJob(
    {
      em: ctx.resolve<EntityManager>('em'),
      paymentGatewayService: ctx.resolve<PaymentGatewayService>('paymentGatewayService'),
      integrationLogService: ctx.resolve<IntegrationLogService>('integrationLogService'),
    },
    job.payload,
  )
}
