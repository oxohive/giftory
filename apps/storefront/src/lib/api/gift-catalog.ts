import 'server-only'
import { z } from 'zod'
import { serverRequest } from './server-http'

/**
 * gift_catalog module API (apps/mercato/src/modules/gift_catalog), public storefront routes:
 *
 *   GET /api/gift_catalog/storefront/occasions                       -> { ok, items: [{ code, label, description, imageUrl, sortOrder }] }
 *   GET /api/gift_catalog/storefront/profiles?occasion=<code>        -> { ok, items: [{ productId, ... }] }  (product ids for an occasion)
 *   GET /api/gift_catalog/storefront/profiles?productIds=<id>        -> { ok, items: [GiftProfile & { productId }] }
 *
 * The shop is identified with `organizationId`/`orgSlug` (`withShop`). Occasion slugs are the
 * gift_catalog occasion codes (`birthday`, `thank_you`, ...). Every call still degrades gracefully:
 * occasions fall back to a static list, and a product without a profile gets the gift_catalog
 * defaults, which are also what the backend enforces at cart/checkout time (no gift wrap,
 * messages up to 250 characters). See docs/backend-api-contract.md section 7.
 */

export type GiftOccasion = {
  id: string
  slug: string
  name: string
  description: string | null
  imageUrl: string | null
  emoji: string | null
}

export type GiftProfile = {
  occasions: string[]
  recipientTypes: string[]
  isCustomizable: boolean
  proofRequired: boolean
  giftWrapAvailable: boolean
  giftMessageMaxLength: number
}

/** Mirrors the backend default for products without a gift profile (storefront/lib/giftOptions.ts). */
export const DEFAULT_GIFT_PROFILE: GiftProfile = {
  occasions: [],
  recipientTypes: [],
  isCustomizable: false,
  proofRequired: false,
  giftWrapAvailable: false,
  giftMessageMaxLength: 250,
}

/** Static fallback so the home page always has a shop-by-occasion grid (slugs = gift_catalog occasion codes). */
export const FALLBACK_OCCASIONS: GiftOccasion[] = [
  { id: 'birthday', slug: 'birthday', name: 'Birthday', description: 'Make their day', imageUrl: null, emoji: '🎂' },
  { id: 'anniversary', slug: 'anniversary', name: 'Anniversary', description: 'Celebrate together', imageUrl: null, emoji: '💞' },
  { id: 'wedding', slug: 'wedding', name: 'Wedding', description: 'For the happy couple', imageUrl: null, emoji: '💍' },
  { id: 'festival', slug: 'festival', name: 'Festivals', description: 'Diwali, Rakhi and more', imageUrl: null, emoji: '🪔' },
  { id: 'baby_shower', slug: 'baby_shower', name: 'Baby Shower', description: 'For the little one', imageUrl: null, emoji: '🍼' },
  { id: 'graduation', slug: 'graduation', name: 'Graduation', description: 'New beginnings', imageUrl: null, emoji: '🎓' },
  { id: 'thank_you', slug: 'thank_you', name: 'Thank You', description: 'Show your gratitude', imageUrl: null, emoji: '🙏' },
  { id: 'corporate', slug: 'corporate', name: 'Corporate', description: 'For teams and clients', imageUrl: null, emoji: '💼' },
]

const occasionWireSchema = z
  .object({
    code: z.string(),
    label: z.string(),
    description: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
  })
  .passthrough()

const occasionListSchema = z.object({ items: z.array(occasionWireSchema) }).passthrough()

const OCCASION_EMOJI: Record<string, string> = {
  birthday: '🎂',
  anniversary: '💞',
  wedding: '💍',
  baby_shower: '🍼',
  graduation: '🎓',
  valentines: '❤️',
  festival: '🪔',
  corporate: '💼',
  thank_you: '🙏',
  other: '🎁',
}

const profileWireSchema = z
  .object({
    productId: z.string(),
    occasions: z.array(z.string()).optional(),
    recipientTypes: z.array(z.string()).optional(),
    isCustomizable: z.boolean().optional(),
    proofRequired: z.boolean().optional(),
    giftWrapAvailable: z.boolean().optional(),
    giftMessageMaxLength: z.number().int().nonnegative().optional(),
  })
  .passthrough()

const profileListSchema = z.object({ items: z.array(profileWireSchema) }).passthrough()

export async function listOccasions(): Promise<{ occasions: GiftOccasion[]; fromFallback: boolean }> {
  try {
    const res = await serverRequest('gift_catalog/storefront/occasions', occasionListSchema, {
      withShop: true,
      revalidate: 600,
      tags: ['occasions'],
    })
    if (!res.items.length) return { occasions: FALLBACK_OCCASIONS, fromFallback: true }
    return {
      occasions: res.items.map((o) => ({
        id: o.code,
        slug: o.code,
        name: o.label,
        description: o.description ?? null,
        imageUrl: o.imageUrl ?? null,
        emoji: OCCASION_EMOJI[o.code] ?? null,
      })),
      fromFallback: false,
    }
  } catch {
    return { occasions: FALLBACK_OCCASIONS, fromFallback: true }
  }
}

/** Product ids tagged with an occasion, or `null` when the endpoint is unavailable (filter ignored). */
export async function listProductIdsForOccasion(slug: string): Promise<string[] | null> {
  try {
    const res = await serverRequest('gift_catalog/storefront/profiles', profileListSchema, {
      withShop: true,
      query: { occasion: slug, pageSize: 100 },
      revalidate: 300,
      tags: ['occasions'],
    })
    return res.items.map((item) => item.productId)
  } catch {
    return null
  }
}

export async function getGiftProfile(productId: string): Promise<{ profile: GiftProfile; fromFallback: boolean }> {
  try {
    const res = await serverRequest('gift_catalog/storefront/profiles', profileListSchema, {
      withShop: true,
      query: { productIds: productId, pageSize: 1 },
      revalidate: 300,
      tags: [`gift-profile:${productId}`],
    })
    const wire = res.items.find((item) => item.productId === productId)
    // No profile is a valid answer: the backend applies the same defaults.
    if (!wire) return { profile: DEFAULT_GIFT_PROFILE, fromFallback: false }
    return {
      profile: {
        occasions: wire.occasions ?? [],
        recipientTypes: wire.recipientTypes ?? [],
        isCustomizable: wire.isCustomizable ?? false,
        proofRequired: wire.proofRequired ?? false,
        giftWrapAvailable: wire.giftWrapAvailable ?? DEFAULT_GIFT_PROFILE.giftWrapAvailable,
        giftMessageMaxLength: wire.giftMessageMaxLength ?? DEFAULT_GIFT_PROFILE.giftMessageMaxLength,
      },
      fromFallback: false,
    }
  } catch {
    return { profile: DEFAULT_GIFT_PROFILE, fromFallback: true }
  }
}
