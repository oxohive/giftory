/**
 * Pure, DOM/Next/fetch-free logic for the capabilities edit form — runs under plain `node --test`
 * (tests/profile-validators.test.mjs) against the real bounds, copied directly from
 * `apps/mercato/src/modules/dealer_org_rbac/data/validators.ts`'s `capabilitiesUpsertSchema`
 * (read verbatim, not guessed):
 *
 *   productTypeCodes: z.array(z.string().trim().min(1).max(100)).max(100).default([])
 *   printingMethods:  z.array(z.enum(PRINTING_METHODS)).max(PRINTING_METHODS.length).default([])
 *   maxDailyCapacity: z.number().int().min(0).max(100_000).default(0)
 *   serviceableStates: z.array(z.enum(INDIAN_STATE_CODES)).max(INDIAN_STATE_CODES.length).default([])
 *   minOrderQty:      z.number().int().min(1).max(10_000).default(1)
 *   updatedAt:        z.string().datetime().optional()
 *
 * The server remains the source of truth — a real 422's `details[]` is folded on top of these
 * client-side errors by `mergeFieldErrors`, the same pattern `lib/features/onboarding/
 * validators.ts` already established for this app, so a drift between this file and the real
 * schema never silently passes.
 *
 * This file deliberately does NOT import `./constants.ts` (even though both live in this same
 * feature folder): this module is loaded directly by `node --test`
 * (tests/profile-validators.test.mjs), and `lib/features/onboarding/validators.ts` already hit
 * the identical tension for its own sibling `constants.ts` — Node's plain ESM loader resolves a
 * relative sibling import fine in isolation, but this repo's bundler-oriented import convention
 * (bare-extension local imports, see root CLAUDE.md) never adds an explicit extension, and adding
 * one here only for this one file would be a special case other code in this app doesn't follow.
 * That file's own resolution stands: "one line of duplication beats a special case." The five
 * `PRINTING_METHODS` and 37 `INDIAN_STATE_CODES` values below are that duplication — both
 * ultimately mirror the same backend source (`dealer_org_rbac/lib/constants.ts`) as
 * `./constants.ts`; keep both in sync if the real enums ever change.
 */
const PRINTING_METHODS = ['sublimation', 'dtg', 'laser_engraving', 'uv_print', 'offset'] as const

const INDIAN_STATE_CODES = [
  'IN-AN', 'IN-AP', 'IN-AR', 'IN-AS', 'IN-BR', 'IN-CH', 'IN-CT', 'IN-DD',
  'IN-DL', 'IN-DN', 'IN-GA', 'IN-GJ', 'IN-HP', 'IN-HR', 'IN-JH', 'IN-JK',
  'IN-KA', 'IN-KL', 'IN-LA', 'IN-LD', 'IN-MH', 'IN-ML', 'IN-MN', 'IN-MP',
  'IN-MZ', 'IN-NL', 'IN-OR', 'IN-PB', 'IN-PY', 'IN-RJ', 'IN-SK', 'IN-TG',
  'IN-TN', 'IN-TR', 'IN-UP', 'IN-UT', 'IN-WB',
] as const

const MAX_DAILY_CAPACITY_MIN = 0
const MAX_DAILY_CAPACITY_MAX = 100_000
const MIN_ORDER_QTY_MIN = 1
const MIN_ORDER_QTY_MAX = 10_000
const PRODUCT_TYPE_CODE_MAX_LENGTH = 100
const PRODUCT_TYPE_CODES_MAX_COUNT = 100

export type FieldErrors = Record<string, string>

export interface CapabilitiesFormValues {
  productTypeCodes: string[]
  printingMethods: string[]
  maxDailyCapacity: number | ''
  serviceableStates: string[]
  minOrderQty: number | ''
}

const PRINTING_METHOD_SET = new Set<string>(PRINTING_METHODS)
const STATE_CODE_SET = new Set<string>(INDIAN_STATE_CODES)

export function validateProductTypeCodes(values: string[]): string | null {
  if (values.length > PRODUCT_TYPE_CODES_MAX_COUNT) {
    return `You can list at most ${PRODUCT_TYPE_CODES_MAX_COUNT} product types.`
  }
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed.length < 1 || trimmed.length > PRODUCT_TYPE_CODE_MAX_LENGTH) {
      return `Each product type must be 1–${PRODUCT_TYPE_CODE_MAX_LENGTH} characters.`
    }
  }
  return null
}

export function validatePrintingMethods(values: string[]): string | null {
  if (values.length > PRINTING_METHODS.length) {
    return `Select at most ${PRINTING_METHODS.length} printing methods.`
  }
  for (const value of values) {
    if (!PRINTING_METHOD_SET.has(value)) return `"${value}" is not a supported printing method.`
  }
  return null
}

export function validateServiceableStates(values: string[]): string | null {
  if (values.length > INDIAN_STATE_CODES.length) {
    return `Select at most ${INDIAN_STATE_CODES.length} states.`
  }
  for (const value of values) {
    if (!STATE_CODE_SET.has(value)) return `"${value}" is not a recognized state code.`
  }
  return null
}

/** Shared by `maxDailyCapacity`/`minOrderQty` — both are required integer fields in this UI (an
 *  emptied input must show a clear error, not silently fall back to the schema's own default on
 *  submit, per this task's "empty/invalid capacity values ... handled with clear errors"
 *  acceptance item). */
function validateRequiredInt(value: number | '', min: number, max: number, label: string): string | null {
  if (value === '' || value === null || value === undefined) return `${label} is required.`
  if (!Number.isInteger(value)) return `${label} must be a whole number.`
  if (value < min || value > max) return `${label} must be between ${min} and ${max}.`
  return null
}

export function validateMaxDailyCapacity(value: number | ''): string | null {
  return validateRequiredInt(value, MAX_DAILY_CAPACITY_MIN, MAX_DAILY_CAPACITY_MAX, 'Max daily capacity')
}

export function validateMinOrderQty(value: number | ''): string | null {
  return validateRequiredInt(value, MIN_ORDER_QTY_MIN, MIN_ORDER_QTY_MAX, 'Minimum order quantity')
}

export function validateCapabilitiesForm(values: CapabilitiesFormValues): FieldErrors {
  const errors: FieldErrors = {}
  const productTypeCodes = validateProductTypeCodes(values.productTypeCodes)
  if (productTypeCodes) errors.productTypeCodes = productTypeCodes
  const printingMethods = validatePrintingMethods(values.printingMethods)
  if (printingMethods) errors.printingMethods = printingMethods
  const serviceableStates = validateServiceableStates(values.serviceableStates)
  if (serviceableStates) errors.serviceableStates = serviceableStates
  const maxDailyCapacity = validateMaxDailyCapacity(values.maxDailyCapacity)
  if (maxDailyCapacity) errors.maxDailyCapacity = maxDailyCapacity
  const minOrderQty = validateMinOrderQty(values.minOrderQty)
  if (minOrderQty) errors.minOrderQty = minOrderQty
  return errors
}

/**
 * Builds exactly the body `PUT .../dealer/profile/capabilities` expects
 * (`capabilitiesUpsertSchema` is `.strict()` — any extra key 422s). `updatedAt` is attached only
 * when the caller actually has a previously-fetched value — there is nothing to send it for on a
 * dealer's very first capability save (no existing row yet, `lastUpdatedAt` is `null`); sending it
 * opts into a real 409 on a stale write (CONTRACT-HANDOFF.md's optimistic-concurrency freeze),
 * omitting it keeps last-write-wins behavior for an older client.
 *
 * Throws if `values` still fails `validateCapabilitiesForm` — callers must validate first (this
 * mirrors the admin editor's own "never serialize provisional invalid values" discipline) so a
 * malformed payload is never even attempted against the network.
 */
export function buildCapabilitiesPayload(
  values: CapabilitiesFormValues,
  lastUpdatedAt: string | null,
): Record<string, unknown> {
  const errors = validateCapabilitiesForm(values)
  if (Object.keys(errors).length > 0) {
    throw new Error('Cannot build a capabilities payload from invalid form values.')
  }
  const payload: Record<string, unknown> = {
    productTypeCodes: values.productTypeCodes.map((v) => v.trim()),
    printingMethods: values.printingMethods,
    maxDailyCapacity: values.maxDailyCapacity,
    serviceableStates: values.serviceableStates,
    minOrderQty: values.minOrderQty,
  }
  if (lastUpdatedAt) payload.updatedAt = lastUpdatedAt
  return payload
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].slice().sort()
  const sortedB = [...b].slice().sort()
  return sortedA.every((value, index) => value === sortedB[index])
}

/**
 * Order-insensitive equality for the capabilities form — toggling a checkbox grid can reorder an
 * array (e.g. remove-then-re-add) without the SET of selected values actually changing; this
 * drives the unsaved-changes guard, which must warn on a real content change, never on an
 * incidental reordering that nets out to the same selections.
 */
export function areCapabilitiesFormValuesEqual(a: CapabilitiesFormValues, b: CapabilitiesFormValues): boolean {
  return (
    sameStringSet(a.productTypeCodes, b.productTypeCodes) &&
    sameStringSet(a.printingMethods, b.printingMethods) &&
    sameStringSet(a.serviceableStates, b.serviceableStates) &&
    a.maxDailyCapacity === b.maxDailyCapacity &&
    a.minOrderQty === b.minOrderQty
  )
}

/**
 * Folds the server's real 422 `details[]` (`{path, message}`, per API-CONTRACTS.md's standard
 * response shape) on top of client-side errors — the server is authoritative, so its message for
 * a field always wins over whatever (if anything) client validation already said.
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
