import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { CredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import { GatewayTransaction } from '@open-mercato/core/modules/payment_gateways/data/entities'
import type { PaymentGatewayService } from '@open-mercato/core/modules/payment_gateways/lib/gateway-service'
import { RAZORPAY_INTEGRATION_ID, RAZORPAY_PROVIDER_KEY, resolveRazorpayCredentials } from '../../lib/credentials'
import { verifyRazorpayPaymentSignature } from '../../lib/signature'

const logger = createLogger('gateway_razorpay').child({ component: 'confirm' })

const RAZORPAY_ID = /^[A-Za-z0-9_]{1,64}$/

export const confirmRazorpayPaymentSchema = z.object({
  razorpay_order_id: z.string().regex(RAZORPAY_ID),
  razorpay_payment_id: z.string().regex(RAZORPAY_ID),
  razorpay_signature: z.string().regex(/^[0-9a-fA-F]{64}$/),
})

const confirmResponseSchema = z.object({
  transactionId: z.string(),
  paymentId: z.string(),
  status: z.string(),
  synced: z.boolean(),
})

export const metadata = {
  path: '/gateway_razorpay/confirm',
  POST: {
    // Public: called by the storefront from the Razorpay Checkout success handler.
    // Trust comes from the HMAC signature, verified against the owning tenant's key secret.
    requireAuth: false,
    rateLimit: { points: 30, duration: 60, keyPrefix: 'gateway_razorpay:confirm' },
  },
}

const VERIFICATION_FAILED = 'Payment signature verification failed'

/**
 * Client-side confirmation for Razorpay Checkout.
 * 1. Locate gateway transactions whose provider session id is the Razorpay order id.
 * 2. Verify razorpay_signature = HMAC_SHA256(order_id|payment_id, key_secret) per candidate tenant.
 * 3. Re-read the order from Razorpay (provider truth) and apply the status through the host
 *    service, so the confirmation converges with webhooks and the poller instead of trusting
 *    the browser. Webhooks remain the source of truth if this call never arrives.
 */
export async function POST(req: Request) {
  const parsed = confirmRazorpayPaymentSchema.safeParse(await readJsonSafe<unknown>(req))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 422 })
  }
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const credentialsService = container.resolve('integrationCredentialsService') as CredentialsService
  const paymentGatewayService = container.resolve('paymentGatewayService') as PaymentGatewayService

  const candidates = await findWithDecryption(
    em,
    GatewayTransaction,
    { providerKey: RAZORPAY_PROVIDER_KEY, providerSessionId: orderId, deletedAt: null },
    { limit: 10, orderBy: { createdAt: 'desc' } },
  )

  let matched: GatewayTransaction | null = null
  for (const candidate of candidates) {
    const scope = { organizationId: candidate.organizationId, tenantId: candidate.tenantId }
    try {
      const stored = await credentialsService.resolve(RAZORPAY_INTEGRATION_ID, scope)
      const credentials = resolveRazorpayCredentials(stored)
      if (verifyRazorpayPaymentSignature({ orderId, paymentId, signature, keySecret: credentials.keySecret })) {
        matched = candidate
        break
      }
    } catch {
      // Misconfigured candidate credentials: treat as non-matching.
    }
  }

  if (!matched) {
    logger.warn('Razorpay payment confirmation rejected', { candidateCount: candidates.length })
    return NextResponse.json({ error: VERIFICATION_FAILED }, { status: 401 })
  }

  const scope = { organizationId: matched.organizationId, tenantId: matched.tenantId }
  try {
    const status = await paymentGatewayService.getPaymentStatus(matched.id, scope)
    return NextResponse.json({
      transactionId: matched.id,
      paymentId: matched.paymentId,
      status: status.status,
      synced: true,
    })
  } catch (error) {
    // Signature is valid but Razorpay could not be reached; webhooks/poller will converge.
    logger.warn('Razorpay status sync after confirmation failed', {
      transactionId: matched.id,
      error: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json({
      transactionId: matched.id,
      paymentId: matched.paymentId,
      status: matched.unifiedStatus,
      synced: false,
    }, { status: 202 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Razorpay',
  methods: {
    POST: {
      summary: 'Confirm a Razorpay Checkout payment',
      description: 'Verifies the Checkout.js success signature and synchronizes the payment status from Razorpay.',
      tags: ['Razorpay'],
      requestBody: { schema: confirmRazorpayPaymentSchema },
      responses: [
        { status: 200, description: 'Signature verified and status synchronized', schema: confirmResponseSchema },
        { status: 202, description: 'Signature verified; status sync deferred to webhooks', schema: confirmResponseSchema },
        { status: 401, description: 'Signature verification failed', schema: z.object({ error: z.string() }) },
        { status: 422, description: 'Invalid payload', schema: z.object({ error: z.string() }) },
        { status: 429, description: 'Rate limit exceeded', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
