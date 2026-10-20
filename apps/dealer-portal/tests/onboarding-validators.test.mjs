import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeFieldErrors,
  normalizeRegisterValues,
  validateBusinessName,
  validateBusinessType,
  validateCity,
  validateContactEmail,
  validateGstin,
  validatePan,
  validatePhone,
  validatePincode,
  validateRegisterForm,
  validateResubmitForm,
  validateState,
} from '../src/lib/features/onboarding/validators.ts'

/**
 * Exercises this task's client-side field validators against REAL GSTIN/PAN/pincode/phone
 * example values (not implementation-mirroring assertions) — the regexes themselves are copied
 * verbatim from `apps/mercato/src/modules/dealer_onboarding/data/validators.ts` (read directly
 * for this task), and these fixtures are drawn from the real-world format each field documents
 * (e.g. GSTIN's own worked example "29ABCDE1234F1Z5" from that file's own doc comment).
 */

// --- GSTIN ---

test('validateGstin accepts a well-formed 15-character GSTIN', () => {
  assert.equal(validateGstin('29ABCDE1234F1Z5'), null)
  assert.equal(validateGstin('09AAACH7409R1ZZ'), null)
})

test('validateGstin is case-insensitive (normalizes to upper before checking)', () => {
  assert.equal(validateGstin('29abcde1234f1z5'), null)
})

test('validateGstin rejects a PAN-length string, a missing checksum, and empty input', () => {
  assert.notEqual(validateGstin('ABCDE1234F'), null)
  assert.notEqual(validateGstin('29ABCDE1234F1Y5'), null) // "Y" where the format requires "Z"
  assert.notEqual(validateGstin(''), null)
  assert.notEqual(validateGstin('29ABCDE1234F1Z'), null) // one character short
})

// --- PAN ---

test('validatePan accepts a well-formed 10-character PAN', () => {
  assert.equal(validatePan('ABCDE1234F'), null)
})

test('validatePan rejects wrong digit/letter placement and empty input', () => {
  assert.notEqual(validatePan('ABCD1234FF'), null) // only 4 leading letters
  assert.notEqual(validatePan('ABCDE12345'), null) // trailing digit, not a letter
  assert.notEqual(validatePan(''), null)
})

// --- phone ---

test('validatePhone accepts common real-world formats', () => {
  assert.equal(validatePhone('+91 98765 43210'), null)
  assert.equal(validatePhone('9876543210'), null)
  assert.equal(validatePhone('(022) 555-1234'), null)
})

test('validatePhone rejects letters and too-short input', () => {
  assert.notEqual(validatePhone('98765abcde'), null)
  assert.notEqual(validatePhone('12345'), null)
  assert.notEqual(validatePhone(''), null)
})

// --- state / pincode / city / business name / email / business type ---

test('validateState accepts real ISO 3166-2:IN codes and rejects a 4-letter or lowercase-only miss', () => {
  assert.equal(validateState('MH'), null)
  assert.equal(validateState('DL'), null)
  assert.equal(validateState('mh'), null) // normalized to upper before checking, like the backend
  assert.notEqual(validateState('MAHA'), null)
  assert.notEqual(validateState(''), null)
})

test('validatePincode accepts exactly 6 digits, rejects anything else', () => {
  assert.equal(validatePincode('560001'), null)
  assert.notEqual(validatePincode('56001'), null)
  assert.notEqual(validatePincode('56000A'), null)
  assert.notEqual(validatePincode(''), null)
})

test('validateCity enforces 1-100 trimmed characters', () => {
  assert.equal(validateCity('Bengaluru'), null)
  assert.notEqual(validateCity('   '), null)
  assert.notEqual(validateCity('x'.repeat(101)), null)
})

test('validateBusinessName enforces 2-200 trimmed characters', () => {
  assert.equal(validateBusinessName('Acme Printing Co'), null)
  assert.notEqual(validateBusinessName('A'), null)
  assert.notEqual(validateBusinessName('x'.repeat(201)), null)
})

test('validateContactEmail rejects an obviously malformed address', () => {
  assert.equal(validateContactEmail('dealer@example.com'), null)
  assert.notEqual(validateContactEmail('not-an-email'), null)
  assert.notEqual(validateContactEmail(''), null)
})

test('validateBusinessType only accepts the four real enum values', () => {
  assert.equal(validateBusinessType('proprietorship'), null)
  assert.equal(validateBusinessType('llp'), null)
  assert.notEqual(validateBusinessType('sole_trader'), null)
  assert.notEqual(validateBusinessType(''), null)
})

// --- whole-form validation ---

const VALID_REGISTER_VALUES = {
  businessName: 'Acme Printing Co',
  contactEmail: 'dealer@example.com',
  phone: '+91 98765 43210',
  gstin: '29ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  businessType: 'proprietorship',
  city: 'Bengaluru',
  state: 'KA',
  pincode: '560001',
}

test('validateRegisterForm returns no errors for a fully valid submission', () => {
  assert.deepEqual(validateRegisterForm(VALID_REGISTER_VALUES), {})
})

test('validateRegisterForm reports every invalid field, not just the first', () => {
  const errors = validateRegisterForm({ ...VALID_REGISTER_VALUES, gstin: 'bad', pan: 'bad', pincode: '12' })
  assert.ok(errors.gstin)
  assert.ok(errors.pan)
  assert.ok(errors.pincode)
  assert.equal(errors.businessName, undefined)
})

test('normalizeRegisterValues trims and uppercases gstin/pan/state like the backend does', () => {
  const normalized = normalizeRegisterValues({ ...VALID_REGISTER_VALUES, gstin: ' 29abcde1234f1z5 ', pan: ' abcde1234f ', state: ' ka ' })
  assert.equal(normalized.gstin, '29ABCDE1234F1Z5')
  assert.equal(normalized.pan, 'ABCDE1234F')
  assert.equal(normalized.state, 'KA')
})

// --- resubmit: every field optional, only what's present gets validated ---

test('validateResubmitForm with no fields present returns no errors (resubmit allows partial updates)', () => {
  assert.deepEqual(validateResubmitForm({}), {})
})

test('validateResubmitForm validates only the fields actually supplied', () => {
  const errors = validateResubmitForm({ gstin: 'not-a-gstin' })
  assert.deepEqual(Object.keys(errors), ['gstin'])
})

test('validateResubmitForm enforces the 2000-character cap on note, mirroring the backend schema', () => {
  assert.deepEqual(validateResubmitForm({ note: 'ok' }), {})
  assert.ok(validateResubmitForm({ note: 'x'.repeat(2001) }).note)
})

// --- merging real server 422 details on top of client errors ---

test('mergeFieldErrors lets a real server detail override/add to client-side errors', () => {
  const merged = mergeFieldErrors({ gstin: 'client says invalid' }, [
    { path: 'gstin', message: 'dealer_onboarding.validation.invalidGstin' },
    { path: 'pan', message: 'dealer_onboarding.validation.invalidPan' },
  ])
  assert.equal(merged.gstin, 'dealer_onboarding.validation.invalidGstin')
  assert.equal(merged.pan, 'dealer_onboarding.validation.invalidPan')
})

test('mergeFieldErrors joins a nested path array the same way the real 422 details shape allows', () => {
  const merged = mergeFieldErrors({}, [{ path: ['documents', 0, 'file'], message: 'A file is required' }])
  assert.equal(merged['documents.0.file'], 'A file is required')
})
