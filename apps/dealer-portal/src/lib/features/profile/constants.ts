/**
 * Real enums for `dealer_org_rbac`'s capabilities (FEAT-009), copied verbatim from
 * `apps/mercato/src/modules/dealer_org_rbac/lib/constants.ts` (read directly, not guessed) — the
 * exact arrays `data/validators.ts`'s `capabilitiesUpsertSchema` validates `printingMethods`/
 * `serviceableStates` against. Kept here, not re-derived, so this app's client-side validation
 * and option lists never drift from the backend's real closed enums.
 *
 * `productTypeCodes` has NO constant list here on purpose: per P2-UI-12's own confirmed finding
 * (restated in this task's briefing, re-verified directly against `data/validators.ts` — it is
 * `z.array(z.string().trim().min(1).max(100)).max(100)`, no `z.enum`), it is genuinely free text.
 * Never add a canonical list for it; render it as an open tag field, mirroring the admin editor's
 * own `allowCustomValues` convention for the same field.
 */
export const PRINTING_METHODS = [
  'sublimation',
  'dtg',
  'laser_engraving',
  'uv_print',
  'offset',
] as const

export type PrintingMethod = (typeof PRINTING_METHODS)[number]

export const PRINTING_METHOD_LABELS: Record<PrintingMethod, string> = {
  sublimation: 'Sublimation',
  dtg: 'DTG (direct-to-garment)',
  laser_engraving: 'Laser engraving',
  uv_print: 'UV print',
  offset: 'Offset',
}

// ISO 3166-2:IN state codes — the same 37-entry list `INDIAN_STATE_CODES` in the backend module.
export const INDIAN_STATE_CODES = [
  'IN-AN', 'IN-AP', 'IN-AR', 'IN-AS', 'IN-BR', 'IN-CH', 'IN-CT', 'IN-DD',
  'IN-DL', 'IN-DN', 'IN-GA', 'IN-GJ', 'IN-HP', 'IN-HR', 'IN-JH', 'IN-JK',
  'IN-KA', 'IN-KL', 'IN-LA', 'IN-LD', 'IN-MH', 'IN-ML', 'IN-MN', 'IN-MP',
  'IN-MZ', 'IN-NL', 'IN-OR', 'IN-PB', 'IN-PY', 'IN-RJ', 'IN-SK', 'IN-TG',
  'IN-TN', 'IN-TR', 'IN-UP', 'IN-UT', 'IN-WB',
] as const

export type IndianStateCode = (typeof INDIAN_STATE_CODES)[number]

export const MAX_DAILY_CAPACITY_MIN = 0
export const MAX_DAILY_CAPACITY_MAX = 100_000
export const MIN_ORDER_QTY_MIN = 1
export const MIN_ORDER_QTY_MAX = 10_000
export const PRODUCT_TYPE_CODE_MAX_LENGTH = 100
export const PRODUCT_TYPE_CODES_MAX_COUNT = 100
