import type {
  CancelInput,
  CancelResult,
  CaptureInput,
  CaptureResult,
  CreateSessionInput,
  CreateSessionResult,
  GatewayAdapter,
  GatewayPaymentStatus,
  GetStatusInput,
  RefundInput,
  RefundResult,
  UnifiedPaymentStatus,
  VerifyWebhookInput,
  WebhookEvent,
} from '@open-mercato/shared/modules/payment_gateways/types'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRazorpayClient, RazorpayApiError, type RazorpayClientOptions, type RazorpayPayment } from './client'
import { RAZORPAY_PROVIDER_KEY, RazorpayConfigurationError, resolveRazorpayCredentials } from './credentials'
import {
  assertSupportedRazorpayCurrency,
  fromMinorUnits,
  RazorpayAmountError,
  toMinorUnits,
  toOrderAmountMinor,
} from './money'
import {
  deriveRazorpayOrderStatus,
  mapRazorpayOrderStatus,
  mapRazorpayPaymentStatus,
  mapRazorpayRefundStatus,
  mapRazorpayWebhookEvent,
} from './status-map'
import { verifyRazorpayWebhook } from './webhook-handler'

export const RAZORPAY_CHECKOUT_RENDERER_KEY = 'razorpay.checkout'

/** Razorpay limits: receipt <= 40 chars; notes <= 15 keys, values <= 256 chars. */
const RECEIPT_MAX_LENGTH = 40
const NOTE_VALUE_MAX_LENGTH = 256

function toReceipt(value: string): string {
  return value.length > RECEIPT_MAX_LENGTH ? value.slice(0, RECEIPT_MAX_LENGTH) : value
}

function buildNotes(entries: Record<string, unknown>): Record<string, string> {
  const notes: Record<string, string> = {}
  for (const [key, value] of Object.entries(entries)) {
    if (Object.keys(notes).length >= 15) break
    if (value === undefined || value === null || value === '') continue
    const text = String(value)
    notes[key] = text.length > NOTE_VALUE_MAX_LENGTH ? text.slice(0, NOTE_VALUE_MAX_LENGTH) : text
  }
  return notes
}

/** Convert local validation errors into 422s so host routes do not report them as gateway 502s. */
function rethrowAsHttpError(error: unknown): never {
  if (error instanceof RazorpayAmountError || error instanceof RazorpayConfigurationError) {
    throw new CrudHttpError(422, { error: error.message })
  }
  throw error
}

function findSettledPayment(payments: RazorpayPayment[]): RazorpayPayment | undefined {
  return payments.find((payment) => payment.status === 'captured' || payment.status === 'refunded')
}

export function createRazorpayAdapter(clientOptions: RazorpayClientOptions = {}): GatewayAdapter {
  function clientFor(credentials: Record<string, unknown>) {
    try {
      return createRazorpayClient(resolveRazorpayCredentials(credentials), clientOptions)
    } catch (error) {
      return rethrowAsHttpError(error)
    }
  }

  return {
    providerKey: RAZORPAY_PROVIDER_KEY,

    async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
      let currency: string
      let amountMinor: number
      try {
        currency = assertSupportedRazorpayCurrency(input.currencyCode)
        amountMinor = toOrderAmountMinor(input.amount, currency)
      } catch (error) {
        return rethrowAsHttpError(error)
      }
      const credentials = resolveRazorpayCredentials(input.credentials)
      const client = clientFor(input.credentials)

      const order = await client.createOrder({
        amount: amountMinor,
        currency,
        // paymentId is a UUID (36 chars) unique per gateway transaction.
        receipt: toReceipt(input.paymentId),
        notes: buildNotes({
          paymentId: input.paymentId,
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          orderId: input.orderId,
          idempotencyKey: input.idempotencyKey,
        }),
        payment_capture: input.captureMethod === 'manual' ? 0 : 1,
      })

      if (order.amount !== amountMinor || order.currency !== currency) {
        throw new Error('Razorpay order amount/currency does not match the requested session')
      }

      const status = mapRazorpayOrderStatus(order.status)
      return {
        sessionId: order.id,
        status: status === 'unknown' ? 'pending' : status,
        providerData: {
          razorpayOrderId: order.id,
          keyId: credentials.keyId,
          mode: credentials.mode,
          amountMinor: order.amount,
          currency: order.currency,
          captureMethod: input.captureMethod ?? 'automatic',
        },
        // What the storefront needs to open Razorpay Checkout.js. key_id is the public key.
        clientSession: {
          type: 'embedded',
          rendererKey: RAZORPAY_CHECKOUT_RENDERER_KEY,
          payload: {
            keyId: credentials.keyId,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            description: input.description ?? null,
          },
        },
      }
    },

    async capture(input: CaptureInput): Promise<CaptureResult> {
      const client = clientFor(input.credentials)
      const payments = await client.fetchOrderPayments(input.sessionId)

      const alreadyCaptured = findSettledPayment(payments)
      if (alreadyCaptured) {
        return {
          status: mapRazorpayPaymentStatus(alreadyCaptured.status),
          capturedAmount: fromMinorUnits(alreadyCaptured.amount, alreadyCaptured.currency),
          providerData: { razorpayPaymentId: alreadyCaptured.id, alreadyCaptured: true },
        }
      }

      const authorized = payments.find((payment) => payment.status === 'authorized')
      if (!authorized) {
        throw new CrudHttpError(409, { error: 'No authorized Razorpay payment exists for this order' })
      }

      let amountMinor = authorized.amount
      if (input.amount !== undefined) {
        try {
          amountMinor = toMinorUnits(input.amount, authorized.currency)
        } catch (error) {
          return rethrowAsHttpError(error)
        }
        // Razorpay captures the full authorized amount only.
        if (amountMinor !== authorized.amount) {
          throw new CrudHttpError(422, { error: 'Razorpay only supports capturing the full authorized amount' })
        }
      }

      let captured: RazorpayPayment
      try {
        captured = await client.capturePayment(authorized.id, amountMinor, authorized.currency)
      } catch (error) {
        // A webhook-driven or auto capture may have won the race; reconcile before failing.
        if (error instanceof RazorpayApiError && error.status === 400) {
          const latest = await client.fetchPayment(authorized.id)
          if (latest.status === 'captured') {
            captured = latest
          } else {
            throw error
          }
        } else {
          throw error
        }
      }

      return {
        status: mapRazorpayPaymentStatus(captured.status),
        capturedAmount: fromMinorUnits(captured.amount, captured.currency),
        providerData: { razorpayPaymentId: captured.id },
      }
    },

    async refund(input: RefundInput): Promise<RefundResult> {
      const client = clientFor(input.credentials)
      const payments = await client.fetchOrderPayments(input.sessionId)
      const payment = findSettledPayment(payments)
      if (!payment) {
        throw new CrudHttpError(409, { error: 'No captured Razorpay payment exists for this order' })
      }

      const alreadyRefunded = payment.amount_refunded ?? 0
      const remaining = payment.amount - alreadyRefunded
      let amountMinor = remaining
      if (input.amount !== undefined) {
        try {
          amountMinor = toMinorUnits(input.amount, payment.currency)
        } catch (error) {
          return rethrowAsHttpError(error)
        }
      }
      if (amountMinor <= 0 || amountMinor > remaining) {
        throw new CrudHttpError(422, { error: 'Refund amount exceeds the refundable Razorpay balance' })
      }

      const refund = await client.refundPayment(payment.id, {
        amount: amountMinor,
        speed: 'normal',
        receipt: input.idempotencyKey ? toReceipt(input.idempotencyKey) : undefined,
        notes: buildNotes({
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        }),
      })

      const isPartial = alreadyRefunded + refund.amount < payment.amount
      return {
        refundId: refund.id,
        status: mapRazorpayRefundStatus(refund.status, isPartial),
        refundedAmount: fromMinorUnits(refund.amount, refund.currency),
        providerData: {
          razorpayPaymentId: payment.id,
          razorpayRefundId: refund.id,
          refundStatus: refund.status,
        },
      }
    },

    async cancel(input: CancelInput): Promise<CancelResult> {
      const client = clientFor(input.credentials)
      const payments = await client.fetchOrderPayments(input.sessionId)
      if (findSettledPayment(payments)) {
        throw new CrudHttpError(409, { error: 'Razorpay payment is already captured; issue a refund instead' })
      }
      // Razorpay has no void/cancel API for orders or authorizations. Uncaptured authorizations
      // are auto-refunded by Razorpay after the account's auto-refund window, so cancelling
      // locally is safe: we simply never capture.
      const authorized = payments.find((payment) => payment.status === 'authorized')
      return {
        status: 'cancelled',
        providerData: {
          razorpayOrderId: input.sessionId,
          pendingAuthorizationPaymentId: authorized?.id ?? null,
          note: authorized ? 'authorization_left_to_auto_refund' : 'no_provider_action_required',
        },
      }
    },

    async getStatus(input: GetStatusInput): Promise<GatewayPaymentStatus> {
      const client = clientFor(input.credentials)
      const [order, payments] = await Promise.all([
        client.fetchOrder(input.sessionId),
        client.fetchOrderPayments(input.sessionId),
      ])
      const derived = deriveRazorpayOrderStatus(order.status, payments)
      const failedAttempt = payments.find((payment) => payment.status === 'failed')
      return {
        status: derived.status,
        amount: fromMinorUnits(order.amount, order.currency),
        amountReceived: fromMinorUnits(order.amount_paid, order.currency),
        currencyCode: order.currency.toUpperCase(),
        providerData: {
          razorpayOrderId: order.id,
          orderStatus: order.status,
          attempts: order.attempts ?? null,
          razorpayPaymentId: derived.payment?.id ?? null,
          paymentStatus: derived.payment?.status ?? null,
          lastFailedErrorCode: failedAttempt?.error_code ?? null,
        },
      }
    },

    async verifyWebhook(input: VerifyWebhookInput): Promise<WebhookEvent> {
      return verifyRazorpayWebhook(input)
    },

    mapStatus(providerStatus: string, eventType?: string): UnifiedPaymentStatus {
      if (eventType) {
        const mapped = mapRazorpayWebhookEvent(eventType, providerStatus)
        if (mapped) return mapped
      }
      const paymentStatus = mapRazorpayPaymentStatus(providerStatus)
      if (paymentStatus !== 'unknown') return paymentStatus
      return mapRazorpayOrderStatus(providerStatus)
    },
  }
}

export const razorpayAdapter: GatewayAdapter = createRazorpayAdapter()
