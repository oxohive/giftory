/**
 * Client-side field validation for the dealer registration/resubmission forms — mirrors the
 * REAL backend schema, copied verbatim from
 * `apps/mercato/src/modules/dealer_onboarding/data/validators.ts` (read directly, not guessed),
 * so a field error shows up before a round trip rather than only after a 422. The backend
 * remains the source of truth: every one of these is re-checked server-side regardless of what
 * passes here (never trust client-side validation alone), and `mergeFieldErrors` folds a real
 * 422 `details[]` array on top of these in case the two ever drift.
 *
 * Pure functions only — no DOM/Next/fetch, and deliberately no import of sibling local files
 * either (not even `./constants`, which declares the identical `DEALER_BUSINESS_TYPES` list) —
 * so this runs under plain `node --test` against fixed example values drawn from the real
 * formats (not just re-asserting the regex literal). Node's ESM loader requires an explicit
 * file extension on every relative import, which this app's bundler-oriented convention
 * (bare-extension local imports — see root CLAUDE.md) never uses; `@/lib/auth/reset-form.ts`
 * hit the identical tension and documented the same resolution: "one line of duplication beats
 * a special case." `DEALER_BUSINESS_TYPES` below is that one line — keep it in sync with
 * constants.ts (both ultimately mirror the same backend source) if the real enum ever changes.
 */

const DEALER_BUSINESS_TYPES = ['proprietorship', 'partnership', 'pvt_ltd', 'llp'] as const

export type FieldErrors = Record<string, string>

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const STATE_PATTERN = /^[A-Z]{2,3}$/
const PINCODE_PATTERN = /^\d{6}$/
const PHONE_PATTERN = /^\+?[0-9\s\-().]{7,20}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface RegisterFormValues {
  businessName: string
  contactEmail: string
  phone: string
  gstin: string
  pan: string
  businessType: string
  city: string
  state: string
  pincode: string
}

/** Same fields, every one optional — the shape `/onboarding/resubmit` submits. */
export type ResubmitFormValues = Partial<RegisterFormValues> & { note?: string }

function requireTrimmed(value: string, min: number, max: number, label: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length < min) return `${label} is required.`
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`
  return null
}

export function validateBusinessName(value: string): string | null {
  return requireTrimmed(value, 2, 200, 'Business name')
}

export function validateContactEmail(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Contact email is required.'
  if (trimmed.length > 254 || !EMAIL_PATTERN.test(trimmed)) return 'Enter a valid email address.'
  return null
}

export function validatePhone(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Phone number is required.'
  if (!PHONE_PATTERN.test(trimmed)) return 'Enter a valid phone number (7–20 digits, may include +, spaces, - ( )).'
  return null
}

/** GSTIN: 15-character alphanumeric — 2-digit state code + 10-char PAN + entity + "Z" + checksum. */
export function validateGstin(value: string): string | null {
  const trimmed = value.trim().toUpperCase()
  if (!trimmed) return 'GSTIN is required.'
  if (!GSTIN_PATTERN.test(trimmed)) return 'Enter a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5).'
  return null
}

/** PAN: 10-character alphanumeric, AAAAA9999A format. */
export function validatePan(value: string): string | null {
  const trimmed = value.trim().toUpperCase()
  if (!trimmed) return 'PAN is required.'
  if (!PAN_PATTERN.test(trimmed)) return 'Enter a valid 10-character PAN (e.g. ABCDE1234F).'
  return null
}

export function validateBusinessType(value: string): string | null {
  if (!(DEALER_BUSINESS_TYPES as readonly string[]).includes(value)) return 'Select a business type.'
  return null
}

export function validateCity(value: string): string | null {
  return requireTrimmed(value, 1, 100, 'City')
}

/** ISO 3166-2:IN state code — backend only checks shape (2–3 uppercase letters), not membership. */
export function validateState(value: string): string | null {
  const trimmed = value.trim().toUpperCase()
  if (!trimmed) return 'State is required.'
  if (!STATE_PATTERN.test(trimmed)) return 'Enter a valid 2–3 letter state code (e.g. MH, DL).'
  return null
}

export function validatePincode(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Pincode is required.'
  if (!PINCODE_PATTERN.test(trimmed)) return 'Enter a valid 6-digit pincode.'
  return null
}

/** Normalizes for submission the same way the backend does (trim, uppercase gstin/pan/state). */
export function normalizeRegisterValues(values: RegisterFormValues): RegisterFormValues {
  return {
    businessName: values.businessName.trim(),
    contactEmail: values.contactEmail.trim(),
    phone: values.phone.trim(),
    gstin: values.gstin.trim().toUpperCase(),
    pan: values.pan.trim().toUpperCase(),
    businessType: values.businessType,
    city: values.city.trim(),
    state: values.state.trim().toUpperCase(),
    pincode: values.pincode.trim(),
  }
}

export function validateRegisterForm(values: RegisterFormValues): FieldErrors {
  const errors: FieldErrors = {}
  const businessName = validateBusinessName(values.businessName)
  if (businessName) errors.businessName = businessName
  const contactEmail = validateContactEmail(values.contactEmail)
  if (contactEmail) errors.contactEmail = contactEmail
  const phone = validatePhone(values.phone)
  if (phone) errors.phone = phone
  const gstin = validateGstin(values.gstin)
  if (gstin) errors.gstin = gstin
  const pan = validatePan(values.pan)
  if (pan) errors.pan = pan
  const businessType = validateBusinessType(values.businessType)
  if (businessType) errors.businessType = businessType
  const city = validateCity(values.city)
  if (city) errors.city = city
  const state = validateState(values.state)
  if (state) errors.state = state
  const pincode = validatePincode(values.pincode)
  if (pincode) errors.pincode = pincode
  return errors
}

const RESUBMIT_FIELD_VALIDATORS: Record<keyof RegisterFormValues, (v: string) => string | null> = {
  businessName: validateBusinessName,
  contactEmail: validateContactEmail,
  phone: validatePhone,
  gstin: validateGstin,
  pan: validatePan,
  businessType: validateBusinessType,
  city: validateCity,
  state: validateState,
  pincode: validatePincode,
}

/** Resubmit fields are all optional server-side — only validate what the dealer actually edited. */
export function validateResubmitForm(values: ResubmitFormValues): FieldErrors {
  const errors: FieldErrors = {}
  for (const key of Object.keys(RESUBMIT_FIELD_VALIDATORS) as (keyof RegisterFormValues)[]) {
    const value = values[key]
    if (value === undefined) continue
    const message = RESUBMIT_FIELD_VALIDATORS[key](value)
    if (message) errors[key] = message
  }
  if (values.note !== undefined && values.note.length > 2000) {
    errors.note = 'Note must be 2000 characters or fewer.'
  }
  return errors
}

/**
 * Folds the server's real 422 `details[]` (`{path, message}`, per API-CONTRACTS.md's standard
 * response shape) on top of client-side errors — the server is authoritative, so its message
 * for a field always wins over whatever (if anything) client validation already said.
 */
export function mergeFieldErrors(
  clientErrors: FieldErrors,
  serverDetails?: Array<{ path: string | number | (string | number)[]; message: string }>,
): FieldErrors {
  const merged: FieldErrors = { ...clientErrors }
  for (const detail of serverDetails ?? []) {
    const path = Array.isArray(detail.path) ? detail.path.join('.') : String(detail.path)
    if (path) merged[path] = detail.message
  }
  return merged
}
