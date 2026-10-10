import type { ProductListParams } from '../../lib/api/catalog'

/**
 * Recipient filter options. The backend (`apps/mercato`'s `gift_catalog`
 * module `GIFT_RECIPIENT_TYPES` constant) validates the `recipient` query
 * param against this exact frozen set of codes — there is no storefront API
 * that lists them, so they're hardcoded here rather than invented/guessed.
 */
export const RECIPIENT_TYPES: Array<{ code: string; label: string }> = [
  { code: 'him', label: 'Him' },
  { code: 'her', label: 'Her' },
  { code: 'kids', label: 'Kids' },
  { code: 'parents', label: 'Parents' },
  { code: 'couple', label: 'Couple' },
  { code: 'friend', label: 'Friend' },
  { code: 'colleague', label: 'Colleague' },
  { code: 'anyone', label: 'Anyone' },
]

export const SORT_OPTIONS: Array<{ value: NonNullable<ProductListParams['sort']>; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'title', label: 'A-Z' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
]

export const DEFAULT_PAGE_SIZE = 24
