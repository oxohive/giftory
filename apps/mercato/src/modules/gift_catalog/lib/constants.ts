/**
 * Stable vocabularies for gift metadata.
 *
 * These codes are persisted in `gift_product_profiles.occasions` /
 * `recipient_types` / `fulfillment_mode` and are part of the public storefront
 * contract, so treat them as frozen: add new codes, never rename existing ones.
 * Display labels live in `i18n/en.json` under `gift_catalog.occasions.codes.*`,
 * `gift_catalog.recipients.*` and `gift_catalog.fulfillment.*`.
 */
export const GIFT_OCCASION_CODES = [
  'birthday',
  'anniversary',
  'wedding',
  'baby_shower',
  'graduation',
  'valentines',
  'festival',
  'corporate',
  'thank_you',
  'other',
] as const

export type GiftOccasionCode = (typeof GIFT_OCCASION_CODES)[number]

export const GIFT_RECIPIENT_TYPES = [
  'him',
  'her',
  'kids',
  'parents',
  'couple',
  'friend',
  'colleague',
  'anyone',
] as const

export type GiftRecipientType = (typeof GIFT_RECIPIENT_TYPES)[number]

/**
 * `platform` = fulfilled by the marketplace operator; `dealer` = routed to a
 * dealer (dealer onboarding/matching arrives in Phase 2, so `dealer` is the
 * default and is currently assigned manually).
 */
export const GIFT_FULFILLMENT_MODES = ['platform', 'dealer'] as const

export type GiftFulfillmentMode = (typeof GIFT_FULFILLMENT_MODES)[number]

export const DEFAULT_GIFT_MESSAGE_MAX_LENGTH = 250
export const MAX_GIFT_MESSAGE_LENGTH = 2000
export const MAX_PRODUCTION_LEAD_TIME_DAYS = 365

export const GIFT_PRODUCT_PROFILE_ENTITY_ID = 'gift_catalog:gift_product_profile' as const
export const GIFT_OCCASION_ENTITY_ID = 'gift_catalog:gift_occasion' as const
export const CATALOG_PRODUCT_ENTITY_ID = 'catalog:catalog_product' as const

export const GIFT_PRODUCT_PROFILE_RESOURCE_KIND = 'gift_catalog.gift_product_profile' as const
export const GIFT_OCCASION_RESOURCE_KIND = 'gift_catalog.gift_occasion' as const

/**
 * Default occasion lookup rows seeded for every organization. `label` is the
 * seed-time display value (stored data, editable by staff afterwards), not a
 * UI string; UI chrome is localized through i18n.
 */
export const DEFAULT_GIFT_OCCASIONS: ReadonlyArray<{
  code: GiftOccasionCode
  label: string
  description: string
  sortOrder: number
}> = [
  { code: 'birthday', label: 'Birthday', description: 'Gifts to celebrate another trip around the sun.', sortOrder: 10 },
  { code: 'anniversary', label: 'Anniversary', description: 'Mark the milestones that matter.', sortOrder: 20 },
  { code: 'wedding', label: 'Wedding', description: 'Gifts for the couple and the wedding party.', sortOrder: 30 },
  { code: 'baby_shower', label: 'Baby Shower', description: 'Welcome gifts for new parents and little ones.', sortOrder: 40 },
  { code: 'graduation', label: 'Graduation', description: 'Celebrate achievements and new beginnings.', sortOrder: 50 },
  { code: 'valentines', label: "Valentine's Day", description: 'Romantic gifts for someone special.', sortOrder: 60 },
  { code: 'festival', label: 'Festivals', description: 'Diwali, Rakhi, Christmas, Eid and more.', sortOrder: 70 },
  { code: 'corporate', label: 'Corporate', description: 'Gifts for teams, clients and events.', sortOrder: 80 },
  { code: 'thank_you', label: 'Thank You', description: 'Say thanks with something memorable.', sortOrder: 90 },
  { code: 'other', label: 'Just Because', description: 'Gifts for any day at all.', sortOrder: 100 },
]

/** Stable command IDs (routes reference these without importing the handlers). */
export const GIFT_PROFILE_CREATE_COMMAND = 'gift_catalog.profiles.create' as const
export const GIFT_PROFILE_UPDATE_COMMAND = 'gift_catalog.profiles.update' as const
export const GIFT_PROFILE_DELETE_COMMAND = 'gift_catalog.profiles.delete' as const
export const GIFT_OCCASION_CREATE_COMMAND = 'gift_catalog.occasions.create' as const
export const GIFT_OCCASION_UPDATE_COMMAND = 'gift_catalog.occasions.update' as const
export const GIFT_OCCASION_DELETE_COMMAND = 'gift_catalog.occasions.delete' as const
