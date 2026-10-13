import { describe, expect, it } from '@jest/globals'
import { mapCapabilitiesSaveError } from '../capabilitiesErrors'

function serverError(status: number, body: Record<string, unknown>): Error & Record<string, unknown> {
  const err = new Error(typeof body.error === 'string' ? body.error : 'Request failed') as Error & Record<string, unknown>
  Object.assign(err, body, { status })
  return err
}

describe('mapCapabilitiesSaveError', () => {
  it('classifies a 409 as conflict — stale capabilities version', () => {
    const err = serverError(409, { error: 'Capabilities were updated by someone else; reload and try again', code: 'request_failed' })
    const mapped = mapCapabilitiesSaveError(err, 'fallback')
    expect(mapped.kind).toBe('conflict')
    expect(mapped.message).toContain('updated by someone else')
  })

  it('classifies a 422 as validation and carries the field-level details through', () => {
    const err = serverError(422, {
      error: 'Invalid request',
      code: 'invalid_request',
      details: [{ path: 'printingMethods.0', message: 'Invalid enum value' }],
    })
    const mapped = mapCapabilitiesSaveError(err, 'fallback')
    expect(mapped.kind).toBe('validation')
    expect(mapped.details).toEqual([{ path: 'printingMethods.0', message: 'Invalid enum value' }])
  })

  it('classifies a 403 as forbidden — the caller lacks dealer_org.admin', () => {
    const err = serverError(403, { error: 'Forbidden', requiredFeatures: ['dealer_org.admin'] })
    const mapped = mapCapabilitiesSaveError(err, 'fallback')
    expect(mapped.kind).toBe('forbidden')
  })

  it('classifies a 400 as not_approved — e.g. the dealer is no longer approved', () => {
    const err = serverError(400, { error: 'Dealer must be approved to perform this action', code: 'request_failed' })
    const mapped = mapCapabilitiesSaveError(err, 'fallback')
    expect(mapped.kind).toBe('not_approved')
  })

  it('falls back to generic for anything else (network failure, 500, etc.)', () => {
    const err = serverError(500, { error: 'Something went wrong', code: 'internal_error' })
    const mapped = mapCapabilitiesSaveError(err, 'fallback')
    expect(mapped.kind).toBe('generic')
  })

  it('uses the fallback message when the thrown value carries none', () => {
    const mapped = mapCapabilitiesSaveError(undefined, 'fallback message')
    expect(mapped.kind).toBe('generic')
    expect(mapped.message).toBe('fallback message')
  })

  it('ignores malformed details arrays instead of throwing', () => {
    const err = serverError(422, { error: 'Invalid request', code: 'invalid_request', details: ['not-an-object', { message: 'no path' }] })
    const mapped = mapCapabilitiesSaveError(err, 'fallback')
    expect(mapped.kind).toBe('validation')
    expect(mapped.details).toEqual([{ path: '', message: 'no path' }])
  })
})
