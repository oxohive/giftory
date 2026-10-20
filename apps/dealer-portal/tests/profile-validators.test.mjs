import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  areCapabilitiesFormValuesEqual,
  buildCapabilitiesPayload,
  mergeFieldErrors,
  validateCapabilitiesForm,
  validateMaxDailyCapacity,
  validateMinOrderQty,
  validatePrintingMethods,
  validateProductTypeCodes,
  validateServiceableStates,
} from '../src/lib/features/profile/validators.ts'

const VALID = {
  productTypeCodes: ['mug', 't-shirt'],
  printingMethods: ['sublimation', 'dtg'],
  maxDailyCapacity: 50,
  serviceableStates: ['IN-KA', 'IN-MH'],
  minOrderQty: 5,
}

test('a fully valid form has no field errors', () => {
  assert.deepEqual(validateCapabilitiesForm(VALID), {})
})

test('empty maxDailyCapacity/minOrderQty are reported as required, not silently defaulted', () => {
  const errors = validateCapabilitiesForm({ ...VALID, maxDailyCapacity: '', minOrderQty: '' })
  assert.match(errors.maxDailyCapacity, /required/i)
  assert.match(errors.minOrderQty, /required/i)
})

test('maxDailyCapacity enforces the real schema bounds (0–100000, integer)', () => {
  assert.equal(validateMaxDailyCapacity(0), null)
  assert.equal(validateMaxDailyCapacity(100000), null)
  assert.match(validateMaxDailyCapacity(-1) ?? '', /between/i)
  assert.match(validateMaxDailyCapacity(100001) ?? '', /between/i)
  assert.match(validateMaxDailyCapacity(1.5) ?? '', /whole number/i)
})

test('minOrderQty enforces the real schema bounds (1–10000, integer)', () => {
  assert.equal(validateMinOrderQty(1), null)
  assert.equal(validateMinOrderQty(10000), null)
  assert.match(validateMinOrderQty(0) ?? '', /between/i)
  assert.match(validateMinOrderQty(10001) ?? '', /between/i)
})

test('printingMethods rejects anything outside the real PRINTING_METHODS enum', () => {
  assert.equal(validatePrintingMethods(['sublimation', 'offset']), null)
  assert.match(validatePrintingMethods(['screen_print']) ?? '', /not a supported printing method/)
})

test('serviceableStates rejects anything outside the real INDIAN_STATE_CODES enum', () => {
  assert.equal(validateServiceableStates(['IN-KA', 'IN-DL']), null)
  assert.match(validateServiceableStates(['KA']) ?? '', /not a recognized state code/)
  assert.match(validateServiceableStates(['US-CA']) ?? '', /not a recognized state code/)
})

test('productTypeCodes rejects an empty/too-long entry and an oversized list', () => {
  assert.equal(validateProductTypeCodes(['mug']), null)
  assert.match(validateProductTypeCodes(['']) ?? '', /1–100 characters/)
  assert.match(validateProductTypeCodes(['x'.repeat(101)]) ?? '', /1–100 characters/)
  assert.match(validateProductTypeCodes(Array.from({ length: 101 }, (_, i) => `t${i}`)) ?? '', /at most 100/)
})

test('buildCapabilitiesPayload sends exactly the real strict-schema keys, trimmed', () => {
  const payload = buildCapabilitiesPayload({ ...VALID, productTypeCodes: ['  mug  '] }, null)
  assert.deepEqual(Object.keys(payload).sort(), [
    'maxDailyCapacity',
    'minOrderQty',
    'printingMethods',
    'productTypeCodes',
    'serviceableStates',
  ])
  assert.deepEqual(payload.productTypeCodes, ['mug'])
})

test('buildCapabilitiesPayload attaches updatedAt only when a prior value exists', () => {
  const withoutPrior = buildCapabilitiesPayload(VALID, null)
  assert.ok(!('updatedAt' in withoutPrior))

  const withPrior = buildCapabilitiesPayload(VALID, '2026-01-01T00:00:00.000Z')
  assert.equal(withPrior.updatedAt, '2026-01-01T00:00:00.000Z')
})

test('buildCapabilitiesPayload throws rather than serialize invalid form values', () => {
  assert.throws(() => buildCapabilitiesPayload({ ...VALID, maxDailyCapacity: '' }, null))
})

test('areCapabilitiesFormValuesEqual is order-insensitive for arrays (checkbox toggling never falsely marks dirty)', () => {
  const a = { ...VALID, printingMethods: ['sublimation', 'dtg'] }
  const b = { ...VALID, printingMethods: ['dtg', 'sublimation'] }
  assert.ok(areCapabilitiesFormValuesEqual(a, b))
})

test('areCapabilitiesFormValuesEqual detects a real content change', () => {
  const a = VALID
  const b = { ...VALID, maxDailyCapacity: 51 }
  assert.ok(!areCapabilitiesFormValuesEqual(a, b))

  const c = { ...VALID, printingMethods: ['sublimation'] }
  assert.ok(!areCapabilitiesFormValuesEqual(VALID, c))
})

test('mergeFieldErrors lets a real 422 details[] win over a client-side message', () => {
  const merged = mergeFieldErrors(
    { maxDailyCapacity: 'client message' },
    [{ path: 'maxDailyCapacity', message: 'server message' }],
  )
  assert.equal(merged.maxDailyCapacity, 'server message')
})

test('mergeFieldErrors joins an array path the same way the server documents it', () => {
  const merged = mergeFieldErrors({}, [{ path: ['printingMethods', 0], message: 'invalid enum value' }])
  assert.equal(merged['printingMethods.0'], 'invalid enum value')
})
