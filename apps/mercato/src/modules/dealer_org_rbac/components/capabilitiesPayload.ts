/**
 * Plain (non-React) helpers for the capability edit form.
 *
 * `buildCapabilitiesPayload` constructs exactly the body
 * `PUT /api/dealer_org_rbac/admin/dealers/{id}/capabilities` expects, per
 * `data/validators.ts`'s `capabilitiesUpsertSchema` (a `.strict()` Zod
 * object — any extra key 422s). It is kept outside React, and the module's
 * own `__tests__` parse its output through the real schema directly
 * (not a hand-mirrored copy of it), so a drift between this payload and the
 * real validator fails a test immediately.
 *
 * `updatedAt` is attached only when the caller actually has a previously
 * fetched value (CONTRACT-HANDOFF.md's optimistic-concurrency freeze: the
 * field is optional and backward compatible — sending it opts into a real
 * 409 on a stale write; omitting it keeps prior last-write-wins behavior).
 * There's nothing to send it for on a dealer's very first capability save
 * (no existing row yet), so `lastUpdatedAt` is nullable here on purpose.
 */
export type CapabilitiesFormValues = {
  productTypeCodes: string[]
  printingMethods: string[]
  maxDailyCapacity: number
  serviceableStates: string[]
  minOrderQty: number
}

export function buildCapabilitiesPayload(
  values: CapabilitiesFormValues,
  lastUpdatedAt: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    productTypeCodes: values.productTypeCodes,
    printingMethods: values.printingMethods,
    maxDailyCapacity: values.maxDailyCapacity,
    serviceableStates: values.serviceableStates,
    minOrderQty: values.minOrderQty,
  }
  if (lastUpdatedAt) payload.updatedAt = lastUpdatedAt
  return payload
}

/**
 * Compact, human-readable summary used by the directory list and the
 * detail page header (e.g. "3 product types · 2 printing methods ·
 * 50/day capacity"). `commands/shared.ts`'s `serializeCapabilities` always
 * returns an object (defaults with `updatedAt: null` when no row exists
 * yet) — it never returns a bare `null` — so this only needs to guard
 * against a missing/undefined value defensively, not treat "no row" as a
 * distinct shape. Use `capabilities.updatedAt == null` separately to tell
 * "never configured" apart from "configured with empty arrays" when that
 * distinction matters (e.g. the capability form uses it to decide whether
 * to send `updatedAt` back on save).
 */
export function summarizeCapabilities(
  capabilities: { productTypeCodes: string[]; printingMethods: string[]; maxDailyCapacity: number } | null | undefined,
): { productTypeCount: number; printingMethodCount: number; maxDailyCapacity: number } | null {
  if (!capabilities) return null
  return {
    productTypeCount: capabilities.productTypeCodes.length,
    printingMethodCount: capabilities.printingMethods.length,
    maxDailyCapacity: capabilities.maxDailyCapacity,
  }
}
