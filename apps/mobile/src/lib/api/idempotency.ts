/**
 * Generates a value for the `Idempotency-Key` header, required by the backend
 * on `POST /checkout/orders` and `POST /orders/{id}/payment-session` (the
 * backend accepts 16-128 chars). A UUID v4 string (36 chars) satisfies that
 * comfortably.
 *
 * Prefers the platform's `crypto.randomUUID()` when it's available (Node 19+,
 * modern browsers, and recent Hermes/React Native runtimes that ship a
 * `crypto` global). Falls back to a Math.random()-based RFC 4122 v4 generator
 * so this module stays dependency-free and works in any JS environment,
 * including a plain Node/Jest run with no RN polyfills loaded. The fallback
 * only needs to guarantee practical uniqueness for idempotency purposes, not
 * cryptographic unguessability.
 */
export function newIdempotencyKey(): string {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }
  return generateUuidV4Fallback()
}

function generateUuidV4Fallback(): string {
  let uuid = ''
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-'
      continue
    }
    if (i === 14) {
      uuid += '4' // version 4
      continue
    }
    const randomNibble = Math.floor(Math.random() * 16)
    // Position 19 is the UUID "variant" nibble: must be 8, 9, a, or b.
    const nibble = i === 19 ? (randomNibble & 0x3) | 0x8 : randomNibble
    uuid += nibble.toString(16)
  }
  return uuid
}
