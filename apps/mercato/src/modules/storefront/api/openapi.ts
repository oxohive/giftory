import { z } from 'zod'
import type { OpenApiResponseDoc } from '@open-mercato/shared/lib/openapi'

export const storefrontTag = 'Storefront'

export const storefrontErrorSchema = z
  .object({ error: z.string(), code: z.string().optional(), details: z.unknown().optional() })
  .passthrough()

/** Shop identification query, accepted by every storefront route. */
export const shopQueryDoc = z.object({
  orgSlug: z.string().optional().describe('Shop slug (platform domains only, ignored when the host or session resolves the shop)'),
  organizationId: z.string().uuid().optional().describe('Shop organization id (platform domains only)'),
})

export const scopeDescription =
  'Public storefront endpoint. The shop is resolved from the custom-domain host, else the signed-in customer session, else the `orgSlug` / `organizationId` query parameter; the tenant is always derived server-side. Rate limited per IP.'

export function commonErrors(extra: OpenApiResponseDoc[] = []): OpenApiResponseDoc[] {
  return [
    { status: 400, description: 'Missing shop identifier', schema: storefrontErrorSchema },
    { status: 404, description: 'Shop or resource not found', schema: storefrontErrorSchema },
    { status: 422, description: 'Invalid request', schema: storefrontErrorSchema },
    { status: 429, description: 'Too many requests', schema: storefrontErrorSchema },
    ...extra,
  ]
}

const decimal = z.number().describe('Decimal major units (INR)')

export const wirePricingSchema = z.object({
  currency_code: z.string(),
  unit_price_net: decimal,
  unit_price_gross: decimal,
  tax_rate: z.number(),
  kind: z.string(),
  price_id: z.string().uuid(),
})

export const wireProductSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    subtitle: z.string().nullable(),
    description: z.string().nullable(),
    sku: z.string().nullable(),
    handle: z.string().nullable(),
    primary_currency_code: z.string(),
    default_media_url: z.string().nullable(),
    is_configurable: z.boolean(),
    is_active: z.boolean(),
    is_quote_only: z.boolean(),
    requires_shipping: z.boolean(),
    min_order_qty: z.number().nullable(),
    max_order_qty: z.number().nullable(),
    order_qty_increment: z.number().nullable(),
    seo_title: z.string().nullable(),
    seo_description: z.string().nullable(),
    categories: z.array(z.object({ id: z.string().uuid(), name: z.string(), slug: z.string().nullable() })),
    categoryIds: z.array(z.string().uuid()),
    pricing: wirePricingSchema.nullable(),
    created_at: z.string().nullable(),
  })
  .passthrough()

export const cartLineViewSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  slug: z.string(),
  title: z.string().nullable(),
  variantName: z.string().nullable(),
  sku: z.string().nullable(),
  imageUrl: z.string().nullable(),
  quantity: z.number().int(),
  maxQuantity: z.number().int().nullable(),
  currencyCode: z.string(),
  unitPriceNet: decimal.nullable(),
  unitPriceGross: decimal.nullable(),
  totalGross: decimal.nullable(),
  gift: z.object({ giftWrap: z.boolean(), giftMessage: z.string().nullable() }),
  isCustomizable: z.boolean(),
  available: z.boolean(),
  issue: z.string().nullable(),
})

export const cartViewSchema = z.object({
  cart: z.object({
    id: z.string().uuid().nullable(),
    currencyCode: z.string(),
    lines: z.array(cartLineViewSchema),
    totals: z.object({ subtotal: decimal, tax: decimal, itemCount: z.number().int() }),
    hasIssues: z.boolean(),
    updatedAt: z.string().nullable(),
  }),
})

export const paymentSessionSchema = z
  .object({
    transactionId: z.string().uuid(),
    sessionId: z.string().nullable(),
    providerKey: z.string(),
    clientSecret: z.string().nullable(),
    redirectUrl: z.string().nullable(),
    providerData: z.record(z.string(), z.unknown()).nullable(),
    clientSession: z.record(z.string(), z.unknown()).nullable(),
    status: z.string(),
    paymentId: z.string().uuid(),
  })
  .describe('Identical to the `POST /api/payment_gateways/sessions` response')

export const placedOrderSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string().nullable(),
  currencyCode: z.string(),
  totals: z.object({ subtotal: decimal, shipping: decimal, tax: decimal, grandTotal: decimal }),
  payment: paymentSessionSchema,
})

export const addressSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.literal('IN'),
  isDefault: z.boolean(),
  updatedAt: z.string().nullable(),
})

export const orderSummarySchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  placedAt: z.string().nullable(),
  currencyCode: z.string().nullable(),
  grandTotalGrossAmount: decimal.nullable(),
  status: z.string().nullable(),
  paymentStatus: z.string().nullable(),
  lineItemCount: z.number().int(),
})

export const orderDetailSchema = z
  .object({
    id: z.string().uuid(),
    orderNumber: z.string().nullable(),
    status: z.string().nullable(),
    paymentStatus: z.string().nullable(),
    placedAt: z.string().nullable(),
    currencyCode: z.string(),
    subtotal: decimal.nullable(),
    shippingTotal: decimal.nullable(),
    taxTotal: decimal.nullable(),
    grandTotal: decimal.nullable(),
    lines: z.array(
      z.object({
        id: z.string().uuid(),
        productId: z.string().nullable(),
        variantId: z.string().nullable(),
        name: z.string().nullable(),
        sku: z.unknown(),
        quantity: z.number(),
        unitPriceGross: decimal.nullable(),
        totalGross: decimal.nullable(),
        giftWrap: z.boolean().nullable(),
        giftMessage: z.string().nullable(),
      }),
    ),
  })
  .passthrough()
