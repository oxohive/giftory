import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import {
  CatalogPriceKind,
  CatalogProduct,
  CatalogProductCategory,
  CatalogProductVariant,
} from '@open-mercato/core/modules/catalog/data/entities'
import { GiftProductProfile } from '../data/entities'
import type { GiftCatalogScope } from '../commands/shared'
import {
  GIFT_PROFILE_CREATE_COMMAND,
  type GiftFulfillmentMode,
  type GiftOccasionCode,
  type GiftRecipientType,
} from './constants'
import { ensureDefaultGiftOccasions } from './seeds'

/**
 * Demo gift catalog for local development and demos (INR pricing).
 *
 * Every catalog write goes through the native catalog commands
 * (`catalog.categories.create`, `catalog.products.create`,
 * `catalog.variants.create`, `catalog.prices.create`, and
 * `catalog.priceKinds.create` when the tenant has no `regular` price kind), so
 * audit logs, events, query-index and cache side effects match a staff-created
 * product. Gift profiles go through `gift_catalog.profiles.create`.
 *
 * Commands run with a trusted system context (`auth: null`, `systemActor: true`,
 * selected organization = target organization), the same shape the platform
 * uses for server-side command callers (e.g. warranty e-mail intake). Catalog
 * commands take explicit `tenantId`/`organizationId` in their input and verify
 * them against that context.
 *
 * Idempotent: categories are matched by slug, products by handle, variants by
 * SKU, and an existing gift profile is never overwritten.
 */

type DemoVariant = {
  name: string
  sku: string
  priceInr: number
  isDefault?: boolean
  optionValues?: Record<string, string>
}

type DemoOption = { code: string; label: string; choices: Array<{ code: string; label: string }> }

type DemoProduct = {
  handle: string
  title: string
  description: string
  categorySlug: string
  option?: DemoOption
  variants: DemoVariant[]
  profile: {
    occasions: GiftOccasionCode[]
    recipientTypes: GiftRecipientType[]
    isCustomizable: boolean
    proofRequired: boolean
    giftWrapAvailable: boolean
    giftMessageMaxLength?: number
    productionLeadTimeDays: number | null
    personalizationNotes?: string | null
    fulfillmentMode: GiftFulfillmentMode
  }
}

const DEMO_CATEGORIES: ReadonlyArray<{ slug: string; name: string; description: string }> = [
  { slug: 'gift-mugs-drinkware', name: 'Mugs & Drinkware', description: 'Personalised mugs, bottles and tumblers.' },
  { slug: 'gift-apparel', name: 'Apparel', description: 'Custom printed T-shirts and hoodies.' },
  { slug: 'gift-photo-frames', name: 'Photo Frames', description: 'Engraved and LED photo frames.' },
  { slug: 'gift-keychains', name: 'Keychains', description: 'Engraved and photo keychains.' },
  { slug: 'gift-trophies-awards', name: 'Trophies & Awards', description: 'Recognition awards and fun trophies.' },
  { slug: 'gift-boxes', name: 'Gift Boxes', description: 'Curated hampers and gift boxes.' },
]

const sizeOption = (choices: string[]): DemoOption => ({
  code: 'size',
  label: 'Size',
  choices: choices.map((choice) => ({ code: choice.toLowerCase(), label: choice })),
})

export const DEMO_GIFT_PRODUCTS: ReadonlyArray<DemoProduct> = [
  {
    handle: 'gift-personalised-photo-mug',
    title: 'Personalised Photo Mug',
    description: 'Glossy ceramic mug printed with your photo and message. Microwave and dishwasher safe.',
    categorySlug: 'gift-mugs-drinkware',
    option: { code: 'capacity', label: 'Capacity', choices: [{ code: '11oz', label: '11 oz' }, { code: '15oz', label: '15 oz' }] },
    variants: [
      { name: '11 oz', sku: 'GIFT-MUG-PHOTO-11OZ', priceInr: 399, isDefault: true, optionValues: { capacity: '11oz' } },
      { name: '15 oz', sku: 'GIFT-MUG-PHOTO-15OZ', priceInr: 499, optionValues: { capacity: '15oz' } },
    ],
    profile: {
      occasions: ['birthday', 'anniversary', 'thank_you'],
      recipientTypes: ['anyone'],
      isCustomizable: true,
      proofRequired: true,
      giftWrapAvailable: true,
      productionLeadTimeDays: 3,
      personalizationNotes: 'Upload one photo (min 1000×1000 px) and up to 40 characters of text.',
      fulfillmentMode: 'dealer',
    },
  },
  {
    handle: 'gift-magic-colour-changing-mug',
    title: 'Magic Colour-Changing Mug',
    description: 'Black mug that reveals your photo when filled with a hot drink.',
    categorySlug: 'gift-mugs-drinkware',
    variants: [{ name: '11 oz', sku: 'GIFT-MUG-MAGIC-11OZ', priceInr: 549, isDefault: true }],
    profile: {
      occasions: ['birthday', 'valentines'],
      recipientTypes: ['him', 'her', 'couple'],
      isCustomizable: true,
      proofRequired: true,
      giftWrapAvailable: true,
      productionLeadTimeDays: 3,
      personalizationNotes: 'One photo; dark backgrounds reveal best.',
      fulfillmentMode: 'dealer',
    },
  },
  {
    handle: 'gift-engraved-steel-bottle',
    title: 'Engraved Insulated Steel Bottle',
    description: 'Double-wall vacuum bottle, laser engraved with a name or logo. Keeps drinks hot 12h / cold 24h.',
    categorySlug: 'gift-mugs-drinkware',
    option: { code: 'capacity', label: 'Capacity', choices: [{ code: '500ml', label: '500 ml' }, { code: '750ml', label: '750 ml' }] },
    variants: [
      { name: '500 ml', sku: 'GIFT-BOTTLE-500ML', priceInr: 899, isDefault: true, optionValues: { capacity: '500ml' } },
      { name: '750 ml', sku: 'GIFT-BOTTLE-750ML', priceInr: 1099, optionValues: { capacity: '750ml' } },
    ],
    profile: {
      occasions: ['corporate', 'graduation'],
      recipientTypes: ['colleague', 'friend'],
      isCustomizable: true,
      proofRequired: false,
      giftWrapAvailable: true,
      productionLeadTimeDays: 2,
      personalizationNotes: 'Name up to 20 characters, or upload a single-colour logo.',
      fulfillmentMode: 'dealer',
    },
  },
  {
    handle: 'gift-custom-printed-tshirt',
    title: 'Custom Printed T-Shirt',
    description: '180 GSM combed cotton tee with your design printed on the front.',
    categorySlug: 'gift-apparel',
    option: sizeOption(['S', 'M', 'L', 'XL']),
    variants: [
      { name: 'S', sku: 'GIFT-TEE-S', priceInr: 599, isDefault: true, optionValues: { size: 's' } },
      { name: 'M', sku: 'GIFT-TEE-M', priceInr: 599, optionValues: { size: 'm' } },
      { name: 'L', sku: 'GIFT-TEE-L', priceInr: 599, optionValues: { size: 'l' } },
      { name: 'XL', sku: 'GIFT-TEE-XL', priceInr: 649, optionValues: { size: 'xl' } },
    ],
    profile: {
      occasions: ['birthday', 'festival'],
      recipientTypes: ['him', 'her', 'friend'],
      isCustomizable: true,
      proofRequired: true,
      giftWrapAvailable: false,
      productionLeadTimeDays: 4,
      personalizationNotes: 'Front print area 25×30 cm; upload artwork or a photo.',
      fulfillmentMode: 'dealer',
    },
  },
  {
    handle: 'gift-couple-hoodies-set',
    title: 'Couple Hoodies Set',
    description: 'Matching pair of fleece hoodies printed with coordinated "his & hers" designs.',
    categorySlug: 'gift-apparel',
    option: sizeOption(['M', 'L']),
    variants: [
      { name: 'M + M', sku: 'GIFT-HOODIE-PAIR-M', priceInr: 2199, isDefault: true, optionValues: { size: 'm' } },
      { name: 'L + L', sku: 'GIFT-HOODIE-PAIR-L', priceInr: 2199, optionValues: { size: 'l' } },
    ],
    profile: {
      occasions: ['valentines', 'anniversary'],
      recipientTypes: ['couple'],
      isCustomizable: true,
      proofRequired: true,
      giftWrapAvailable: true,
      productionLeadTimeDays: 5,
      personalizationNotes: 'Two names (up to 12 characters each) and an optional date.',
      fulfillmentMode: 'dealer',
    },
  },
  {
    handle: 'gift-engraved-wooden-photo-frame',
    title: 'Engraved Wooden Photo Frame',
    description: 'Solid sheesham wood frame with a laser-engraved message below the photo.',
    categorySlug: 'gift-photo-frames',
    option: { code: 'frame-size', label: 'Frame size', choices: [{ code: '5x7', label: '5×7 in' }, { code: '8x10', label: '8×10 in' }] },
    variants: [
      { name: '5×7 in', sku: 'GIFT-FRAME-WOOD-5X7', priceInr: 749, isDefault: true, optionValues: { 'frame-size': '5x7' } },
      { name: '8×10 in', sku: 'GIFT-FRAME-WOOD-8X10', priceInr: 999, optionValues: { 'frame-size': '8x10' } },
    ],
    profile: {
      occasions: ['anniversary', 'wedding'],
      recipientTypes: ['parents', 'couple'],
      isCustomizable: true,
      proofRequired: true,
      giftWrapAvailable: true,
      productionLeadTimeDays: 3,
      personalizationNotes: 'Engraving up to 60 characters; photo is printed and inserted.',
      fulfillmentMode: 'dealer',
    },
  },
  {
    handle: 'gift-led-collage-photo-frame',
    title: 'LED Collage Photo Frame',
    description: 'Backlit acrylic collage frame holding 6 photos, USB powered.',
    categorySlug: 'gift-photo-frames',
    variants: [{ name: 'Standard', sku: 'GIFT-FRAME-LED-6', priceInr: 1499, isDefault: true }],
    profile: {
      occasions: ['birthday', 'anniversary'],
      recipientTypes: ['anyone'],
      isCustomizable: true,
      proofRequired: true,
      giftWrapAvailable: true,
      productionLeadTimeDays: 4,
      personalizationNotes: 'Upload exactly 6 photos.',
      fulfillmentMode: 'dealer',
    },
  },
  {
    handle: 'gift-engraved-metal-keychain',
    title: 'Engraved Metal Keychain',
    description: 'Brushed steel keychain engraved on both sides.',
    categorySlug: 'gift-keychains',
    variants: [{ name: 'Standard', sku: 'GIFT-KEYCHAIN-METAL', priceInr: 249, isDefault: true }],
    profile: {
      occasions: ['thank_you', 'corporate'],
      recipientTypes: ['anyone'],
      isCustomizable: true,
      proofRequired: false,
      giftWrapAvailable: false,
      giftMessageMaxLength: 120,
      productionLeadTimeDays: 2,
      personalizationNotes: 'Up to 15 characters per side.',
      fulfillmentMode: 'dealer',
    },
  },
  {
    handle: 'gift-photo-acrylic-keychain-pair',
    title: 'Photo Acrylic Keychain (Set of 2)',
    description: 'Two heart-shaped acrylic keychains printed with your photos.',
    categorySlug: 'gift-keychains',
    variants: [{ name: 'Set of 2', sku: 'GIFT-KEYCHAIN-ACRYLIC-2', priceInr: 299, isDefault: true }],
    profile: {
      occasions: ['valentines', 'other'],
      recipientTypes: ['couple', 'friend'],
      isCustomizable: true,
      proofRequired: true,
      giftWrapAvailable: true,
      productionLeadTimeDays: 2,
      personalizationNotes: 'Upload two photos.',
      fulfillmentMode: 'dealer',
    },
  },
  {
    handle: 'gift-crystal-recognition-award',
    title: 'Crystal Recognition Award',
    description: 'Optical crystal award with sandblasted engraving, presented in a satin-lined box.',
    categorySlug: 'gift-trophies-awards',
    option: sizeOption(['Small', 'Large']),
    variants: [
      { name: 'Small (6 in)', sku: 'GIFT-AWARD-CRYSTAL-S', priceInr: 1799, isDefault: true, optionValues: { size: 'small' } },
      { name: 'Large (9 in)', sku: 'GIFT-AWARD-CRYSTAL-L', priceInr: 2499, optionValues: { size: 'large' } },
    ],
    profile: {
      occasions: ['corporate', 'graduation'],
      recipientTypes: ['colleague'],
      isCustomizable: true,
      proofRequired: true,
      giftWrapAvailable: false,
      productionLeadTimeDays: 7,
      personalizationNotes: 'Recipient name, title and citation (up to 120 characters); optional logo.',
      fulfillmentMode: 'platform',
    },
  },
  {
    handle: 'gift-worlds-best-dad-trophy',
    title: '"World\'s Best Dad" Trophy',
    description: 'Gold-finish trophy on a wooden base with an engraved name plate.',
    categorySlug: 'gift-trophies-awards',
    variants: [{ name: 'Standard', sku: 'GIFT-TROPHY-BEST-DAD', priceInr: 699, isDefault: true }],
    profile: {
      occasions: ['birthday', 'other'],
      recipientTypes: ['parents', 'him'],
      isCustomizable: true,
      proofRequired: false,
      giftWrapAvailable: true,
      productionLeadTimeDays: 3,
      personalizationNotes: 'Name plate up to 24 characters.',
      fulfillmentMode: 'dealer',
    },
  },
  {
    handle: 'gift-diwali-celebration-hamper',
    title: 'Diwali Celebration Hamper',
    description: 'Dry fruits, artisanal sweets, diyas and a scented candle in a reusable gift box.',
    categorySlug: 'gift-boxes',
    option: { code: 'hamper', label: 'Hamper', choices: [{ code: 'standard', label: 'Standard' }, { code: 'premium', label: 'Premium' }] },
    variants: [
      { name: 'Standard', sku: 'GIFT-HAMPER-DIWALI-STD', priceInr: 1999, isDefault: true, optionValues: { hamper: 'standard' } },
      { name: 'Premium', sku: 'GIFT-HAMPER-DIWALI-PREM', priceInr: 3499, optionValues: { hamper: 'premium' } },
    ],
    profile: {
      occasions: ['festival', 'corporate'],
      recipientTypes: ['anyone'],
      isCustomizable: false,
      proofRequired: false,
      giftWrapAvailable: true,
      productionLeadTimeDays: 1,
      personalizationNotes: null,
      fulfillmentMode: 'platform',
    },
  },
]

export type DemoSeedReport = {
  occasionsInserted: number
  categoriesCreated: number
  productsCreated: number
  productsExisting: number
  variantsCreated: number
  pricesCreated: number
  profilesCreated: number
}

type Log = (message: string) => void

function buildSystemContext(container: AwilixContainer, scope: GiftCatalogScope): CommandRuntimeContext {
  return {
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
    syncOrigin: 'gift_catalog.seed_demo',
    systemActor: true,
  }
}

async function ensurePriceKindId(
  em: EntityManager,
  commandBus: CommandBus,
  ctx: CommandRuntimeContext,
  scope: GiftCatalogScope,
): Promise<string> {
  const existing = await em.findOne(CatalogPriceKind, {
    tenantId: scope.tenantId,
    code: 'regular',
    deletedAt: null,
  } as FilterQuery<CatalogPriceKind>)
  if (existing) return String(existing.id)
  const { result } = await commandBus.execute<Record<string, unknown>, { priceKindId: string }>('catalog.priceKinds.create', {
    input: {
      tenantId: scope.tenantId,
      code: 'regular',
      title: 'Regular',
      displayMode: 'including-tax',
      currencyCode: 'INR',
    },
    ctx,
  })
  return result.priceKindId
}

async function ensureCategoryIds(
  em: EntityManager,
  commandBus: CommandBus,
  ctx: CommandRuntimeContext,
  scope: GiftCatalogScope,
  report: DemoSeedReport,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const category of DEMO_CATEGORIES) {
    const existing = await em.findOne(CatalogProductCategory, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      slug: category.slug,
      deletedAt: null,
    } as FilterQuery<CatalogProductCategory>)
    if (existing) {
      ids.set(category.slug, String(existing.id))
      continue
    }
    const { result } = await commandBus.execute<Record<string, unknown>, { categoryId: string }>('catalog.categories.create', {
      input: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        name: category.name,
        slug: category.slug,
        description: category.description,
        isActive: true,
      },
      ctx,
    })
    ids.set(category.slug, result.categoryId)
    report.categoriesCreated += 1
  }
  return ids
}

export async function seedGiftDemoCatalog(
  container: AwilixContainer,
  scope: GiftCatalogScope,
  log: Log = () => undefined,
): Promise<DemoSeedReport> {
  const report: DemoSeedReport = {
    occasionsInserted: 0,
    categoriesCreated: 0,
    productsCreated: 0,
    productsExisting: 0,
    variantsCreated: 0,
    pricesCreated: 0,
    profilesCreated: 0,
  }
  const em = (container.resolve('em') as EntityManager).fork()
  const commandBus = container.resolve('commandBus') as CommandBus
  const ctx = buildSystemContext(container, scope)

  report.occasionsInserted = await ensureDefaultGiftOccasions(em, scope)
  const priceKindId = await ensurePriceKindId(em, commandBus, ctx, scope)
  const categoryIds = await ensureCategoryIds(em, commandBus, ctx, scope, report)

  for (const seed of DEMO_GIFT_PRODUCTS) {
    em.clear()
    const existingProduct = await findOneWithDecryption(
      em,
      CatalogProduct,
      { tenantId: scope.tenantId, organizationId: scope.organizationId, handle: seed.handle, deletedAt: null } as FilterQuery<CatalogProduct>,
      undefined,
      scope,
    )
    let productId: string
    if (existingProduct) {
      productId = String(existingProduct.id)
      report.productsExisting += 1
    } else {
      const categoryId = categoryIds.get(seed.categorySlug)
      const configurable = seed.variants.length > 1
      const { result } = await commandBus.execute<Record<string, unknown>, { productId: string }>('catalog.products.create', {
        input: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          title: seed.title,
          description: seed.description,
          handle: seed.handle,
          productType: configurable ? 'configurable' : 'simple',
          isConfigurable: configurable,
          primaryCurrencyCode: 'INR',
          isActive: true,
          ...(categoryIds.size && categoryId ? { categoryIds: [categoryId] } : {}),
          ...(seed.option
            ? {
                optionSchema: {
                  name: seed.option.label,
                  options: [
                    {
                      code: seed.option.code,
                      label: seed.option.label,
                      inputType: 'select',
                      isRequired: true,
                      choices: seed.option.choices,
                    },
                  ],
                },
              }
            : {}),
          tags: ['gift', 'demo'],
        },
        ctx,
      })
      productId = result.productId
      report.productsCreated += 1
      log(`  + product ${seed.title}`)
    }

    for (const variant of seed.variants) {
      const existingVariant = await em.findOne(CatalogProductVariant, {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        sku: variant.sku,
        deletedAt: null,
      } as FilterQuery<CatalogProductVariant>)
      if (existingVariant) continue
      const { result: variantResult } = await commandBus.execute<Record<string, unknown>, { variantId: string }>(
        'catalog.variants.create',
        {
          input: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            productId,
            name: variant.name,
            sku: variant.sku,
            isDefault: variant.isDefault === true,
            isActive: true,
            ...(variant.optionValues ? { optionValues: variant.optionValues } : {}),
          },
          ctx,
        },
      )
      report.variantsCreated += 1
      await commandBus.execute('catalog.prices.create', {
        input: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          productId,
          variantId: variantResult.variantId,
          priceKindId,
          currencyCode: 'INR',
          minQuantity: 1,
          unitPriceGross: variant.priceInr,
        },
        ctx,
      })
      report.pricesCreated += 1
    }

    const existingProfile = await em.findOne(GiftProductProfile, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      productId,
      deletedAt: null,
    } as FilterQuery<GiftProductProfile>)
    if (!existingProfile) {
      await commandBus.execute(GIFT_PROFILE_CREATE_COMMAND, {
        input: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          productId,
          occasions: seed.profile.occasions,
          recipientTypes: seed.profile.recipientTypes,
          isCustomizable: seed.profile.isCustomizable,
          proofRequired: seed.profile.proofRequired,
          giftWrapAvailable: seed.profile.giftWrapAvailable,
          giftMessageMaxLength: seed.profile.giftMessageMaxLength ?? 250,
          productionLeadTimeDays: seed.profile.productionLeadTimeDays,
          personalizationNotes: seed.profile.personalizationNotes ?? null,
          fulfillmentMode: seed.profile.fulfillmentMode,
        },
        ctx,
      })
      report.profilesCreated += 1
    }
  }

  return report
}
