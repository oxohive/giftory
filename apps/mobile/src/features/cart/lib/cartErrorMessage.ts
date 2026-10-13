import { ApiError } from '../../../lib/api/errors'

/**
 * Human-readable text for a failed cart call, mirroring
 * `apps/storefront/src/lib/api/cart.ts`'s `cartErrorMessage`/`describeLineIssue`.
 *
 * NOTE on the issue shape: `lib/api/cart.ts` exports a `CartLineIssue` type
 * declared as `{ lineId, code, message }` per the (stale) task contract, but
 * its own doc comment flags that the real wire shape for `422 cart_invalid`
 * details has no `lineId` at all — it's `{ index, productId, variantId, code,
 * maxLength }`. This file defines its own `RealCartLineIssue` matching that
 * real shape instead of trusting the exported (wrong) type. There is also no
 * reliable way from `index`/`productId` alone to attribute an issue to one
 * specific `CartLine.id` in the current cart (`index` could refer to a
 * position in the request body rather than the response's line list), so this
 * renders a single cart-wide message instead of trying to pin an issue to a
 * row — safer than a guessed, possibly-wrong per-line mapping.
 */

export interface RealCartLineIssue {
  index?: number
  productId?: string
  variantId?: string | null
  code: string
  maxLength?: number
}

const DEFAULT_GIFT_MESSAGE_MAX_LENGTH = 250

function describeLineIssue(issue: RealCartLineIssue): string {
  switch (issue.code) {
    case 'product_unavailable':
      return 'An item in your cart is no longer available.'
    case 'variant_unavailable':
      return 'A selected option is no longer available.'
    case 'quantity_below_minimum':
      return 'A quantity is below the minimum for that item.'
    case 'quantity_above_maximum':
      return 'A quantity is above the maximum for that item.'
    case 'gift_wrap_unavailable':
      return 'Gift wrap isn’t available for one of your items.'
    case 'gift_message_not_allowed':
      return 'Gift messages aren’t available for one of your items.'
    case 'gift_message_too_long':
      return issue.maxLength
        ? `A gift message is too long (maximum ${issue.maxLength} characters).`
        : 'A gift message is too long.'
    default:
      return 'One of your cart items couldn’t be updated as selected.'
  }
}

/** Line issues of a `422 cart_invalid` error (empty for any other error). */
export function cartIssuesFromError(error: unknown): RealCartLineIssue[] {
  if (!(error instanceof ApiError) || error.code !== 'cart_invalid') return []
  const details = error.details
  return Array.isArray(details) ? (details as RealCartLineIssue[]) : []
}

/** Readable message for a failed cart call. */
export function cartErrorMessage(error: unknown): string {
  const issues = cartIssuesFromError(error)
  if (issues.length) {
    return [...new Set(issues.map(describeLineIssue))].join(' ')
  }
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many cart updates. Please wait a moment and try again.'
    if (error.status >= 500 || error.code === 'network') {
      return 'We couldn’t reach the server. Please check your connection and try again.'
    }
    return error.message || 'Your cart couldn’t be updated. Please try again.'
  }
  return 'Your cart couldn’t be updated. Please try again.'
}

/** Conservative client-side default used only for immediate inline feedback; the server (per
 * product/variant `giftMessageMaxLength`) remains authoritative via `cart_invalid` responses. */
export { DEFAULT_GIFT_MESSAGE_MAX_LENGTH }
