import type { GiftFulfillmentMode } from './constants'

/** Query-engine projection row for `gift_product_profiles` (snake_case DB columns). */
export type ProfileRow = {
  id: string
  product_id: string
  occasions: unknown
  recipient_types: unknown
  is_customizable: boolean
  proof_required: boolean
  gift_wrap_available: boolean
  gift_message_max_length: number
  production_lead_time_days: number | null
  personalization_notes: string | null
  fulfillment_mode: string
  tenant_id: string | null
  organization_id: string | null
  created_at: Date | string | null
  updated_at: Date | string | null
}

/** Query-engine projection row for `gift_occasions`. */
export type OccasionRow = {
  id: string
  code: string
  label: string
  description: string | null
  sort_order: number
  is_active: boolean
  image_url: string | null
  tenant_id: string | null
  organization_id: string | null
  created_at: Date | string | null
  updated_at: Date | string | null
}

export function toIsoTimestamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  return null
}

/**
 * Normalizes a `text[]` value. The ORM hydrates arrays, but raw query-engine
 * rows may surface the Postgres literal (`{a,b}`) depending on the driver path.
 */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1).trim()
    return inner.length ? inner.split(',').map((entry) => entry.trim().replace(/^"|"$/g, '')) : []
  }
  return []
}

function toFulfillmentMode(value: unknown): GiftFulfillmentMode {
  return value === 'platform' ? 'platform' : 'dealer'
}

export function transformProfileRow(item: ProfileRow) {
  return {
    id: String(item.id),
    productId: String(item.product_id),
    occasions: toStringArray(item.occasions),
    recipientTypes: toStringArray(item.recipient_types),
    isCustomizable: Boolean(item.is_customizable),
    proofRequired: Boolean(item.proof_required),
    giftWrapAvailable: Boolean(item.gift_wrap_available),
    giftMessageMaxLength: Number(item.gift_message_max_length ?? 0),
    productionLeadTimeDays: item.production_lead_time_days == null ? null : Number(item.production_lead_time_days),
    personalizationNotes: item.personalization_notes ?? null,
    fulfillmentMode: toFulfillmentMode(item.fulfillment_mode),
    tenantId: item.tenant_id ?? null,
    organizationId: item.organization_id ?? null,
    createdAt: toIsoTimestamp(item.created_at),
    updatedAt: toIsoTimestamp(item.updated_at),
  }
}

export type GiftProfileListItem = ReturnType<typeof transformProfileRow>

export function transformOccasionRow(item: OccasionRow) {
  return {
    id: String(item.id),
    code: String(item.code),
    label: String(item.label),
    description: item.description ?? null,
    sortOrder: Number(item.sort_order ?? 0),
    isActive: Boolean(item.is_active),
    imageUrl: item.image_url ?? null,
    tenantId: item.tenant_id ?? null,
    organizationId: item.organization_id ?? null,
    createdAt: toIsoTimestamp(item.created_at),
    updatedAt: toIsoTimestamp(item.updated_at),
  }
}

export type GiftOccasionListItem = ReturnType<typeof transformOccasionRow>
