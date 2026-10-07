import { createHash } from 'node:crypto'
import { GIFT_MESSAGE_HARD_LIMIT } from './constants'

/**
 * Gift options are validated against the product's gift profile owned by
 * `gift_catalog` (read through its storefront query helper, never through an
 * ORM relation). Products without a profile get the gift_catalog defaults:
 * no gift wrap, messages up to 250 characters.
 */
export type GiftProfileRules = {
  giftWrapAvailable: boolean
  giftMessageMaxLength: number
}

export const DEFAULT_GIFT_RULES: GiftProfileRules = { giftWrapAvailable: false, giftMessageMaxLength: 250 }

export type GiftOptionsInput = { giftWrap?: boolean | null; giftMessage?: string | null }

export type GiftOptionsResult =
  | { ok: true; giftWrap: boolean; giftMessage: string | null }
  | { ok: false; code: 'gift_wrap_unavailable' | 'gift_message_not_allowed' | 'gift_message_too_long'; maxLength: number }

export function normalizeGiftMessage(message: string | null | undefined): string | null {
  if (typeof message !== 'string') return null
  // Collapse CR/LF variants and trim; keep inner line breaks (cards can be multi-line).
  const normalized = message.replace(/\r\n?/g, '\n').trim()
  return normalized.length ? normalized : null
}

export function validateGiftOptions(input: GiftOptionsInput, rules: GiftProfileRules | null): GiftOptionsResult {
  const effective = rules ?? DEFAULT_GIFT_RULES
  const maxLength = Math.max(0, Math.min(effective.giftMessageMaxLength, GIFT_MESSAGE_HARD_LIMIT))
  const giftWrap = input.giftWrap === true
  if (giftWrap && !effective.giftWrapAvailable) return { ok: false, code: 'gift_wrap_unavailable', maxLength }
  const giftMessage = normalizeGiftMessage(input.giftMessage)
  if (giftMessage !== null) {
    if (maxLength === 0) return { ok: false, code: 'gift_message_not_allowed', maxLength }
    // Count user-perceived characters (emoji, Indic conjuncts) rather than UTF-16 units.
    if (Array.from(giftMessage).length > maxLength) return { ok: false, code: 'gift_message_too_long', maxLength }
  }
  return { ok: true, giftWrap, giftMessage }
}

/** Same product + variant + gift options = same cart line. */
export function cartLineKey(productId: string, variantId: string | null, giftWrap: boolean, giftMessage: string | null): string {
  const messageHash = createHash('sha256').update(giftMessage ?? '').digest('hex').slice(0, 16)
  return `${productId}:${variantId ?? '-'}:${giftWrap ? 'w' : 'n'}:${messageHash}`
}
