import { randomUUID } from 'node:crypto'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isCrudHttpError, isUniqueViolation } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { CreateSessionResult } from '@open-mercato/shared/modules/payment_gateways/types'
import { SalesOrder, SalesPaymentMethod } from '@open-mercato/core/modules/sales/data/entities'
import type { GatewayTransaction } from '@open-mercato/core/modules/payment_gateways/data/entities'
import type { PaymentGatewayService } from '@open-mercato/core/modules/payment_gateways/lib/gateway-service'
import { StorefrontCheckout } from '../data/entities'
import type { AddressFields, PaymentSessionRetryInput, PlaceOrderInput } from '../data/validators'
import { emitStorefrontEvent } from '../events'
import { cartLineInputs, markCartConverted, readCartOwner, resolveCart } from './cart'
import { repriceLines, type PricedLine } from './catalog'
import {
  CHECKOUT_KIND_ORDER,
  CHECKOUT_KIND_PAYMENT_RETRY,
  CHECKOUT_STATUS,
  MONEY_TAKEN_STATUSES,
  ORDER_ACCESS_COOKIE,
  ORDER_ACCESS_COOKIE_MAX_AGE_SECONDS,
  ORDER_EXTERNAL_REFERENCE_PREFIX,
  ORDER_SOURCE,
  SALES_PAYMENT_STATUS_DICTIONARY_KEY,
  STOREFRONT_CURRENCY,
  STOREFRONT_PRICE_KIND_CODE,
  type StorefrontPaymentProvider,
} from './constants'
import { ensureCustomerPerson, findOrCreatePerson, normalizeIndianPhone } from './customerLink'
import { StorefrontError, type CookieSpec, type Translate } from './http'
import { normalizeGiftMessage } from './giftOptions'
import { decideIdempotency, hashRequest, substituteOrderId } from './idempotency'
import { loadAccessibleOrder, resolveRequester } from './orders'
import { syncCheckoutPayment } from './paymentSync'
import { orderAmountDue, orderTotals } from './paymentState'
import { summarizeTotals, type OrderTotals } from './pricing'
import { isAllowedReturnUrl } from './returnUrls'
import type { ShopperContext, StorefrontScope } from './scope'
import { listShippingMethods, manualShippingAdjustment, quoteShipping, type ShippingMethodRecord } from './shipping'
import { executeCommand, findSalesDictionaryEntryId, systemCommandContext } from './system'
import { generateToken, hashToken, parseOrderAccess, readCookie, serializeOrderAccess } from './tokens'

const logger = createLogger('storefront').child({ component: 'checkout' })

/** Exactly the body `POST /api/payment_gateways/sessions` returns. */
export type PaymentSessionPayload = {
  transactionId: string
  sessionId: string | null
  providerKey: string
  clientSecret: string | null
  redirectUrl: string | null
  providerData: Record<string, unknown> | null
  clientSession: Record<string, unknown> | null
  status: string
  paymentId: string
}

export type CheckoutResult = {
  status: number
  body: {
    orderId: string
    orderNumber: string | null
    currencyCode: string
    totals: OrderTotals
    payment: PaymentSessionPayload
  }
  cookies: CookieSpec[]
}

type CheckoutArgs = {
  req: Request
  container: AppContainer
  shopper: ShopperContext
  idempotencyKey: string
  translate: Translate
}

// ---------------------------------------------------------------------------
// Ledger claim (idempotency)
// ---------------------------------------------------------------------------

type ClaimSpec = {
  kind: string
  idempotencyKey: string
  requestHash: string
  customerUserId: string | null
  providerKey: StorefrontPaymentProvider
  orderId?: string | null
  orderNumber?: string | null
}

async function claimCheckout(
  em: EntityManager,
  scope: StorefrontScope,
  spec: ClaimSpec,
  translate: Translate,
): Promise<{ checkout: StorefrontCheckout; created: boolean }> {
  const where = {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    idempotencyKey: spec.idempotencyKey,
  } as FilterQuery<StorefrontCheckout>
  let existing = await em.findOne(StorefrontCheckout, where)
  if (!existing) {
    const now = new Date()
    const checkout = em.create(StorefrontCheckout, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      kind: spec.kind,
      idempotencyKey: spec.idempotencyKey,
      requestHash: spec.requestHash,
      status: spec.orderId ? CHECKOUT_STATUS.orderCreated : CHECKOUT_STATUS.processing,
      claimedAt: now,
      customerUserId: spec.customerUserId,
      orderId: spec.orderId ?? null,
      orderNumber: spec.orderNumber ?? null,
      currencyCode: STOREFRONT_CURRENCY,
      subtotalAmount: '0',
      shippingAmount: '0',
      taxAmount: '0',
      grandTotalAmount: '0',
      providerKey: spec.providerKey,
      paymentId: randomUUID(),
      paymentStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    try {
      await em.flush()
      return { checkout, created: true }
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      em.clear()
      existing = await em.findOne(StorefrontCheckout, where)
      if (!existing) throw err
    }
  }
  const decision = decideIdempotency(
    { requestHash: existing.requestHash, status: existing.status, claimedAt: existing.claimedAt ?? null, orderId: existing.orderId ?? null },
    spec.requestHash,
    new Date(),
  )
  if (decision === 'mismatch' || existing.kind !== spec.kind) {
    throw new StorefrontError(
      409,
      'idempotency_key_reused',
      translate('storefront.errors.idempotencyReused', 'This Idempotency-Key was already used for a different request'),
    )
  }
  if (decision === 'in_progress') {
    throw new StorefrontError(
      409,
      'checkout_in_progress',
      translate('storefront.errors.checkoutInProgress', 'Your order is still being processed. Please wait a moment.'),
      undefined,
      { 'retry-after': '2' },
    )
  }
  if (decision === 'reclaim') {
    const taken = await em.nativeUpdate(
      StorefrontCheckout,
      { id: existing.id, claimedAt: existing.claimedAt ?? null, orderId: null } as FilterQuery<StorefrontCheckout>,
      // No order exists yet, so the stalled attempt can be taken over with this request's body.
      { claimedAt: new Date(), requestHash: spec.requestHash, providerKey: spec.providerKey, customerUserId: spec.customerUserId },
    )
    if (taken === 0) {
      throw new StorefrontError(
        409,
        'checkout_in_progress',
        translate('storefront.errors.checkoutInProgress', 'Your order is still being processed. Please wait a moment.'),
        undefined,
        { 'retry-after': '2' },
      )
    }
    await em.refresh(existing)
  }
  return { checkout: existing, created: false }
}

/** Drop a claim that never produced an order, so the key can be retried (even with a corrected body). */
async function releaseClaim(em: EntityManager, checkout: StorefrontCheckout): Promise<void> {
  await em
    .nativeDelete(StorefrontCheckout, { id: checkout.id, orderId: null } as FilterQuery<StorefrontCheckout>)
    .catch((err: unknown) => logger.warn('Failed to release checkout claim', { err, checkoutId: checkout.id }))
}

// ---------------------------------------------------------------------------
// Payment sessions
// ---------------------------------------------------------------------------

function toPayload(transaction: GatewayTransaction, session: CreateSessionResult): PaymentSessionPayload {
  const clientSession = (session.clientSession ?? null) as Record<string, unknown> | null
  const redirectFromClient =
    clientSession && clientSession.type === 'redirect' && typeof clientSession.redirectUrl === 'string' ? clientSession.redirectUrl : null
  return {
    transactionId: String(transaction.id),
    sessionId: session.sessionId ?? null,
    providerKey: transaction.providerKey,
    clientSecret: session.clientSecret ?? null,
    redirectUrl: session.redirectUrl ?? redirectFromClient,
    providerData: (session.providerData as Record<string, unknown> | undefined) ?? null,
    clientSession,
    status: String(session.status),
    paymentId: String(transaction.paymentId),
  }
}

/** Rebuild the session payload of an existing transaction (idempotent replay). */
function restorePayload(transaction: GatewayTransaction): PaymentSessionPayload {
  const metadata = (transaction.gatewayMetadata && typeof transaction.gatewayMetadata === 'object'
    ? (transaction.gatewayMetadata as Record<string, unknown>)
    : {}) as Record<string, unknown>
  const { clientSession, ...providerData } = metadata
  return toPayload(transaction, {
    sessionId: transaction.providerSessionId ?? '',
    status: transaction.unifiedStatus,
    clientSecret: transaction.clientSecret ?? undefined,
    redirectUrl: transaction.redirectUrl ?? undefined,
    providerData: Object.keys(providerData).length ? providerData : undefined,
    clientSession: clientSession && typeof clientSession === 'object' ? (clientSession as CreateSessionResult['clientSession']) : undefined,
  } as CreateSessionResult)
}

async function openPaymentSession(
  container: AppContainer,
  em: EntityManager,
  scope: StorefrontScope,
  checkout: StorefrontCheckout,
  order: SalesOrder,
  urls: { successUrl: string; cancelUrl: string },
  translate: Translate,
): Promise<PaymentSessionPayload> {
  const gateway = container.resolve('paymentGatewayService') as PaymentGatewayService
  if (checkout.gatewayTransactionId) {
    const existing = await gateway.findTransaction(checkout.gatewayTransactionId, scope)
    if (existing) return restorePayload(existing)
  }
  const amount = orderAmountDue(order)
  if (amount <= 0) {
    throw new StorefrontError(409, 'order_already_paid', translate('storefront.errors.orderAlreadyPaid', 'This order is already paid'), {
      orderId: order.id,
      orderNumber: order.orderNumber ?? null,
    })
  }
  try {
    const { transaction, session } = await gateway.createPaymentSession({
      providerKey: checkout.providerKey,
      paymentId: checkout.paymentId,
      // Stable per ledger row: a retried request gets the same provider session back.
      idempotencyKey: `storefront-checkout:${checkout.id}`,
      orderId: String(order.id),
      amount,
      currencyCode: order.currencyCode,
      description: translate('storefront.payment.description', 'Order {orderNumber}', { orderNumber: order.orderNumber ?? String(order.id) }),
      successUrl: substituteOrderId(urls.successUrl, String(order.id)),
      cancelUrl: substituteOrderId(urls.cancelUrl, String(order.id)),
      metadata: { source: ORDER_SOURCE, orderId: String(order.id), orderNumber: order.orderNumber ?? null, checkoutId: checkout.id },
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
    })
    checkout.gatewayTransactionId = String(transaction.id)
    checkout.paymentStatus = String(transaction.unifiedStatus)
    checkout.status = CHECKOUT_STATUS.completed
    checkout.lastError = null
    await em.flush()
    if (MONEY_TAKEN_STATUSES.has(checkout.paymentStatus) || checkout.paymentStatus === 'authorized') {
      // Some sessions come back already settled; no status event follows those.
      await syncCheckoutPayment(container, { transactionId: String(transaction.id), ...scope }).catch((err: unknown) =>
        logger.warn('Inline payment sync failed', { err, checkoutId: checkout.id }),
      )
    }
    return toPayload(transaction, session)
  } catch (err) {
    const message = isCrudHttpError(err) && typeof err.body?.error === 'string' ? err.body.error : null
    checkout.lastError = (message ?? (err instanceof Error ? err.message : 'payment session failed')).slice(0, 500)
    await em.flush().catch(() => undefined)
    logger.warn('Payment session creation failed', { checkoutId: checkout.id, providerKey: checkout.providerKey, err })
    throw new StorefrontError(
      isCrudHttpError(err) && err.status >= 400 && err.status < 500 ? 422 : 502,
      'payment_session_failed',
      translate('storefront.errors.paymentSessionFailed', 'We could not start the payment. Your order is saved — please try again.'),
      { orderId: order.id, orderNumber: order.orderNumber ?? null, providerError: message },
    )
  }
}

// ---------------------------------------------------------------------------
// Order placement
// ---------------------------------------------------------------------------

function addressSnapshot(address: AddressFields, purpose: 'shipping' | 'billing') {
  return {
    name: address.fullName,
    purpose,
    phone: normalizeIndianPhone(address.phone) ?? address.phone,
    addressLine1: address.line1,
    addressLine2: address.line2 ?? null,
    city: address.city,
    region: address.state,
    postalCode: address.postalCode,
    country: address.country,
  }
}

function lineName(line: PricedLine): string {
  const name = line.variantName ? `${line.title} — ${line.variantName}` : line.title
  return name.slice(0, 255)
}

function orderLinesInput(lines: PricedLine[]) {
  return lines.map((line, index) => ({
    lineNumber: index + 1,
    kind: 'product' as const,
    productId: line.productId,
    ...(line.variantId ? { productVariantId: line.variantId } : {}),
    name: lineName(line),
    currencyCode: STOREFRONT_CURRENCY,
    quantity: line.quantity,
    priceId: line.amounts.priceId,
    priceMode: 'gross' as const,
    unitPriceNet: line.amounts.unitNet,
    unitPriceGross: line.amounts.unitGross,
    taxRate: line.amounts.taxRate,
    taxAmount: line.amounts.taxAmount,
    totalGrossAmount: line.amounts.totalGross,
    catalogSnapshot: {
      source: ORDER_SOURCE,
      title: line.title,
      variantName: line.variantName,
      sku: line.sku,
      handle: line.handle,
      imageUrl: line.imageUrl,
      priceId: line.amounts.priceId,
      priceKind: STOREFRONT_PRICE_KIND_CODE,
      unitPriceGross: line.amounts.unitGross,
    },
    metadata: {
      source: ORDER_SOURCE,
      gift: { giftWrap: line.giftWrap, giftMessage: line.giftMessage },
    },
  }))
}

async function findPaymentMethodId(em: EntityManager, scope: StorefrontScope, provider: string): Promise<string | null> {
  const method = await em.findOne(SalesPaymentMethod, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
    isActive: true,
    $or: [{ providerKey: provider }, { code: provider }],
  } as FilterQuery<SalesPaymentMethod>)
  return method ? String(method.id) : null
}

async function resolveCustomerEntityId(
  container: AppContainer,
  shopper: ShopperContext,
  input: PlaceOrderInput,
): Promise<string | null> {
  try {
    if (shopper.customer) {
      return await ensureCustomerPerson(container, shopper.scope, {
        customerUserId: shopper.customer.sub,
        email: shopper.customer.email || input.email,
        displayName: shopper.customer.displayName || input.shippingAddress.fullName,
        phone: input.shippingAddress.phone,
      })
    }
    return await findOrCreatePerson(container, shopper.scope, {
      email: input.email,
      displayName: (input.billingAddress ?? input.shippingAddress).fullName,
      phone: input.shippingAddress.phone,
    })
  } catch (err) {
    // CRM linking must never block a paid order; the order keeps a customer snapshot.
    logger.warn('CRM customer linking failed during checkout', { err })
    return null
  }
}

async function loadOrder(em: EntityManager, scope: StorefrontScope, orderId: string): Promise<SalesOrder | null> {
  return findOneWithDecryption(
    em,
    SalesOrder,
    { id: orderId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<SalesOrder>,
    undefined,
    scope,
  )
}

async function createSalesOrder(
  container: AppContainer,
  em: EntityManager,
  shopper: ShopperContext,
  checkout: StorefrontCheckout,
  input: PlaceOrderInput,
  lines: PricedLine[],
  method: ShippingMethodRecord,
  req: Request,
): Promise<string> {
  const scope = shopper.scope
  const externalReference = `${ORDER_EXTERNAL_REFERENCE_PREFIX}${checkout.id}`
  // A previous attempt may have created the order and crashed before recording it.
  const orphan = await em.findOne(SalesOrder, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    externalReference,
    deletedAt: null,
  } as FilterQuery<SalesOrder>)
  if (orphan) return String(orphan.id)

  const billing = input.billingSameAsShipping || !input.billingAddress ? input.shippingAddress : input.billingAddress
  const customerEntityId = await resolveCustomerEntityId(container, shopper, input)
  const [paymentMethodId, pendingEntryId] = await Promise.all([
    findPaymentMethodId(em, scope, input.paymentProvider),
    findSalesDictionaryEntryId(em, scope, SALES_PAYMENT_STATUS_DICTIONARY_KEY, 'pending'),
  ])
  const shippingAdjustment = manualShippingAdjustment(method)
  const phone = normalizeIndianPhone(input.shippingAddress.phone)
  const result = await executeCommand<Record<string, unknown>, { orderId: string }>(
    container,
    'sales.orders.create',
    {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      currencyCode: STOREFRONT_CURRENCY,
      externalReference,
      ...(customerEntityId ? { customerEntityId } : {}),
      customerSnapshot: {
        customer: {
          id: customerEntityId,
          kind: 'person',
          displayName: shopper.customer?.displayName || billing.fullName,
          primaryEmail: input.email,
          primaryPhone: phone,
        },
      },
      shippingAddressSnapshot: addressSnapshot(input.shippingAddress, 'shipping'),
      billingAddressSnapshot: addressSnapshot(billing, 'billing'),
      shippingMethodId: method.id,
      ...(paymentMethodId ? { paymentMethodId } : {}),
      ...(pendingEntryId ? { paymentStatusEntryId: pendingEntryId } : {}),
      placedAt: new Date(),
      metadata: {
        source: ORDER_SOURCE,
        checkoutId: checkout.id,
        customerUserId: shopper.customer?.sub ?? null,
        contactEmail: input.email,
        paymentProvider: input.paymentProvider,
      },
      lines: orderLinesInput(lines),
      ...(shippingAdjustment
        ? {
            adjustments: [
              {
                scope: 'order',
                kind: 'shipping',
                code: shippingAdjustment.code ?? undefined,
                label: shippingAdjustment.label ?? undefined,
                amountNet: shippingAdjustment.amountNet ?? 0,
                amountGross: shippingAdjustment.amountGross ?? 0,
                currencyCode: STOREFRONT_CURRENCY,
                metadata: shippingAdjustment.metadata ?? undefined,
                position: 0,
              },
            ],
          }
        : {}),
    },
    systemCommandContext(container, scope, req),
  )
  const orderId = String(result.orderId)
  checkout.customerEntityId = customerEntityId

  // Native document addresses (shown in the backoffice order view). The order
  // already carries both snapshots, so this is best-effort.
  for (const [purpose, address] of [
    ['shipping', input.shippingAddress],
    ['billing', billing],
  ] as const) {
    await executeCommand(
      container,
      'sales.document-addresses.create',
      {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        documentId: orderId,
        documentKind: 'order',
        name: address.fullName,
        purpose,
        addressLine1: address.line1,
        addressLine2: address.line2 ?? null,
        city: address.city,
        region: address.state,
        postalCode: address.postalCode,
        country: address.country,
      },
      systemCommandContext(container, scope),
    ).catch((err: unknown) => logger.debug('Document address not created', { err, purpose, orderId }))
  }
  return orderId
}

export async function placeOrder(args: CheckoutArgs & { input: PlaceOrderInput }): Promise<CheckoutResult> {
  const { req, container, shopper, input, idempotencyKey, translate } = args
  const scope = shopper.scope
  const em = (container.resolve('em') as EntityManager).fork()

  if (!isAllowedReturnUrl(input.successUrl) || !isAllowedReturnUrl(input.cancelUrl)) {
    throw new StorefrontError(422, 'return_url_not_allowed', translate('storefront.errors.returnUrl', 'Return URL is not allowed'))
  }

  const owner = readCartOwner(req, shopper.customer)
  const { cart } = await resolveCart(em, scope, owner, false)
  const requested = input.lines ?? (cart ? await cartLineInputs(em, scope, cart) : [])

  // A cart checkout converts the cart, so a replay would see an empty cart. Bind the key to the
  // cart owner instead of its contents; explicit lines stay part of the hash.
  const requestHash = hashRequest({
    scope,
    customerUserId: shopper.customer?.sub ?? null,
    email: input.email,
    lines: input.lines
      ? input.lines.map((line) => [
          line.productId,
          line.variantId ?? null,
          line.quantity,
          line.giftWrap === true,
          normalizeGiftMessage(line.giftMessage),
        ])
      : { source: 'cart', owner: shopper.customer?.sub ?? (owner.token ? hashRequest(owner.token) : null) },
    shippingAddress: input.shippingAddress,
    billingAddress: input.billingSameAsShipping ? null : input.billingAddress ?? null,
    shippingMethodCode: input.shippingMethodCode,
    paymentProvider: input.paymentProvider,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  })

  // An idempotent replay of a request that already produced an order skips re-validation:
  // the catalog may have changed since, but the order (and its prices) stand.
  const previous = await em.findOne(StorefrontCheckout, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    idempotencyKey,
  } as FilterQuery<StorefrontCheckout>)
  const resuming = Boolean(previous?.orderId && previous.requestHash === requestHash)
  if (!resuming && !requested.length) {
    throw new StorefrontError(422, 'cart_empty', translate('storefront.errors.cartEmpty', 'Your cart is empty'))
  }

  let lines: PricedLine[] = []
  let method: ShippingMethodRecord | undefined
  if (!resuming) {
    const repriced = await repriceLines(em, scope, requested)
    if (repriced.issues.length) {
      throw new StorefrontError(422, 'cart_invalid', translate('storefront.errors.cartInvalidCheckout', 'Some items in your cart are no longer available as selected'), {
        details: repriced.issues,
      })
    }
    lines = repriced.lines
    method = (await listShippingMethods(em, scope)).find((candidate) => candidate.code === input.shippingMethodCode)
    if (!method) {
      throw new StorefrontError(422, 'shipping_method_unavailable', translate('storefront.errors.shippingMethod', 'The selected delivery option is not available'))
    }
  }

  const { checkout } = await claimCheckout(
    em,
    scope,
    {
      kind: CHECKOUT_KIND_ORDER,
      idempotencyKey,
      requestHash,
      customerUserId: shopper.customer?.sub ?? null,
      providerKey: input.paymentProvider,
    },
    translate,
  )

  let createdNow = false
  if (!checkout.orderId) {
    if (!method) {
      // Raced with a concurrent replay that released its claim; validate on the next attempt.
      await releaseClaim(em, checkout)
      throw new StorefrontError(409, 'checkout_in_progress', translate('storefront.errors.checkoutInProgress', 'Your order is still being processed. Please wait a moment.'), undefined, { 'retry-after': '2' })
    }
    const shippingMethod = method
    const computed = summarizeTotals(
      lines.map((line) => line.amounts),
      await quoteShipping(
        container,
        scope,
        shippingMethod,
        lines.map((line) => ({
          productId: line.productId,
          productVariantId: line.variantId,
          quantity: line.quantity,
          unitPriceNet: line.amounts.unitNet,
          unitPriceGross: line.amounts.unitGross,
          taxRate: line.amounts.taxRate,
          taxAmount: line.amounts.taxAmount,
          totalGrossAmount: line.amounts.totalGross,
        })),
      ),
    )
    let orderId: string
    try {
      orderId = await createSalesOrder(container, em, shopper, checkout, input, lines, shippingMethod, req)
    } catch (err) {
      await releaseClaim(em, checkout)
      throw err
    }
    const order = await loadOrder(em, scope, orderId)
    if (!order) throw new Error('[internal] created sales order not found')
    const totals = orderTotals(order)
    if (Math.abs(totals.grandTotal - computed.grandTotal) > 0.009) {
      // Sales extensions (tax/discount/provider hooks) changed the total; the order is authoritative.
      logger.info('Order total differs from storefront quote', { orderId, quoted: computed.grandTotal, order: totals.grandTotal })
    }
    checkout.orderId = orderId
    checkout.orderNumber = order.orderNumber ?? null
    checkout.subtotalAmount = String(totals.subtotal)
    checkout.shippingAmount = String(totals.shipping)
    checkout.taxAmount = String(totals.tax)
    checkout.grandTotalAmount = String(totals.grandTotal)
    checkout.status = CHECKOUT_STATUS.orderCreated
    await em.flush()
    createdNow = true
    if (cart) await markCartConverted(em, cart, orderId).catch((err: unknown) => logger.warn('Failed to close cart', { err }))
    await emitStorefrontEvent('storefront.order.placed', {
      orderId,
      orderNumber: order.orderNumber ?? null,
      checkoutId: checkout.id,
      customerUserId: shopper.customer?.sub ?? null,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    }).catch((err: unknown) => logger.warn('Failed to emit storefront.order.placed', { err }))
  }

  const order = await loadOrder(em, scope, checkout.orderId!)
  if (!order) throw new StorefrontError(404, 'order_not_found', translate('storefront.errors.orderNotFound', 'Order not found'))
  const cookies: CookieSpec[] = []
  if (!shopper.customer) {
    // Guests read their order (and retry its payment) through a per-order access token cookie.
    // Issued before the payment session so it also reaches the guest when payment fails.
    const token = generateToken()
    checkout.guestAccessTokenHash = hashToken(token)
    await em.flush()
    const entries = parseOrderAccess(readCookie(req, ORDER_ACCESS_COOKIE))
    cookies.push({
      name: ORDER_ACCESS_COOKIE,
      value: serializeOrderAccess(entries, { orderId: String(order.id), token }),
      maxAge: ORDER_ACCESS_COOKIE_MAX_AGE_SECONDS,
    })
  }

  let payment: Awaited<ReturnType<typeof openPaymentSession>>
  try {
    payment = await openPaymentSession(container, em, scope, checkout, order, input, translate)
  } catch (err) {
    if (err instanceof StorefrontError) err.cookies.push(...cookies)
    throw err
  }
  return {
    status: createdNow ? 201 : 200,
    body: {
      orderId: String(order.id),
      orderNumber: order.orderNumber ?? null,
      currencyCode: order.currencyCode,
      totals: orderTotals(order),
      payment,
    },
    cookies,
  }
}

/**
 * New payment session for an existing unpaid order (e.g. the shopper closed
 * the Razorpay modal or the card was declined). Avoids duplicate orders.
 */
export async function retryOrderPayment(args: CheckoutArgs & { orderId: string; input: PaymentSessionRetryInput }): Promise<CheckoutResult> {
  const { req, container, shopper, input, idempotencyKey, translate, orderId } = args
  const scope = shopper.scope
  const em = (container.resolve('em') as EntityManager).fork()
  if (!isAllowedReturnUrl(input.successUrl) || !isAllowedReturnUrl(input.cancelUrl)) {
    throw new StorefrontError(422, 'return_url_not_allowed', translate('storefront.errors.returnUrl', 'Return URL is not allowed'))
  }
  const requester = await resolveRequester(em, req, shopper)
  const accessible = await loadAccessibleOrder(em, scope, orderId, requester)
  if (!accessible) throw new StorefrontError(404, 'order_not_found', translate('storefront.errors.orderNotFound', 'Order not found'))
  const { order, checkouts } = accessible
  if (checkouts.some((checkout) => MONEY_TAKEN_STATUSES.has(checkout.paymentStatus)) || orderAmountDue(order) <= 0) {
    throw new StorefrontError(409, 'order_already_paid', translate('storefront.errors.orderAlreadyPaid', 'This order is already paid'), {
      orderId: order.id,
      orderNumber: order.orderNumber ?? null,
    })
  }
  const requestHash = hashRequest({
    scope,
    orderId: order.id,
    customerUserId: shopper.customer?.sub ?? null,
    paymentProvider: input.paymentProvider,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  })
  const { checkout, created } = await claimCheckout(
    em,
    scope,
    {
      kind: CHECKOUT_KIND_PAYMENT_RETRY,
      idempotencyKey,
      requestHash,
      customerUserId: shopper.customer?.sub ?? null,
      providerKey: input.paymentProvider,
      orderId: String(order.id),
      orderNumber: order.orderNumber ?? null,
    },
    translate,
  )
  if (created) {
    const totals = orderTotals(order)
    checkout.customerEntityId = order.customerEntityId ?? null
    checkout.subtotalAmount = String(totals.subtotal)
    checkout.shippingAmount = String(totals.shipping)
    checkout.taxAmount = String(totals.tax)
    checkout.grandTotalAmount = String(totals.grandTotal)
    // Keep guest access working for this attempt too.
    const original = checkouts.find((candidate) => candidate.guestAccessTokenHash)
    if (original) checkout.guestAccessTokenHash = original.guestAccessTokenHash
    await em.flush()
  }
  const payment = await openPaymentSession(container, em, scope, checkout, order, input, translate)
  return {
    status: created ? 201 : 200,
    body: {
      orderId: String(order.id),
      orderNumber: order.orderNumber ?? null,
      currencyCode: order.currencyCode,
      totals: orderTotals(order),
      payment,
    },
    cookies: [],
  }
}
