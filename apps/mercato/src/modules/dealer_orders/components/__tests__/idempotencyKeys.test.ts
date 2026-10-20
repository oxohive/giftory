import { describe, expect, it } from '@jest/globals'
import {
  buildOperationKey,
  getOrCreateIdempotencyKey,
  releaseIdempotencyKey,
  peekIdempotencyKey,
} from '../idempotencyKeys'

describe('idempotencyKeys', () => {
  it('builds a stable, action+order-scoped operation key', () => {
    expect(buildOperationKey('assign', 'order-1')).toBe('assign:order-1')
    expect(buildOperationKey('reassign', 'order-1')).toBe('reassign:order-1')
  })

  it('mints a key on first use and nothing before that', () => {
    const op = buildOperationKey('assign', 'order-mint-1')
    expect(peekIdempotencyKey(op)).toBeNull()
    const key = getOrCreateIdempotencyKey(op)
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
  })

  it('reuses the SAME key across repeated calls for the same operation (double-click / retry)', () => {
    const op = buildOperationKey('assign', 'order-retry-1')
    const first = getOrCreateIdempotencyKey(op)
    const second = getOrCreateIdempotencyKey(op)
    const third = getOrCreateIdempotencyKey(op)
    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it('mints a DIFFERENT key for a distinct operation (different order or different action)', () => {
    const assignKey = getOrCreateIdempotencyKey(buildOperationKey('assign', 'order-distinct-1'))
    const anotherOrderKey = getOrCreateIdempotencyKey(buildOperationKey('assign', 'order-distinct-2'))
    const reassignKey = getOrCreateIdempotencyKey(buildOperationKey('reassign', 'order-distinct-1'))
    expect(anotherOrderKey).not.toBe(assignKey)
    expect(reassignKey).not.toBe(assignKey)
  })

  it('mints a FRESH key after release — the next operation is treated as genuinely new', () => {
    const op = buildOperationKey('assign', 'order-release-1')
    const first = getOrCreateIdempotencyKey(op)
    releaseIdempotencyKey(op)
    expect(peekIdempotencyKey(op)).toBeNull()
    const second = getOrCreateIdempotencyKey(op)
    expect(second).not.toBe(first)
  })

  it('releasing an operation with no key is a safe no-op', () => {
    expect(() => releaseIdempotencyKey('never-minted:order-x')).not.toThrow()
  })
})
