/**
 * Types for `dealer_org_rbac`'s dealer-facing profile/capabilities surface (FEAT-009, P2-UI-06).
 *
 * `DealerOrgProfile` is the exact `GET /api/dealer_org_rbac/dealer/profile` response shape,
 * verified directly against the real route
 * (`apps/mercato/src/modules/dealer_org_rbac/api/dealer/profile/route.ts`, which spreads
 * `dealer_onboarding`'s own `serializeDealerProfile(profile)` plus `capabilities:
 * serializeCapabilities(cap)`) rather than the broader, deliberately-loose `DealerOrgProfile`
 * stub in `@gift/api-client` (that stub predates this task and only pins `id`/`organizationId`/
 * `businessName`/`capabilities`, with a `[key: string]: unknown` escape hatch — this file
 * replaces that escape hatch with the real fields for this task's own call sites). Note what is
 * NOT here: `gstin`/`pan` are never returned by this route (the backend's own serializer omits
 * them, same as `dealer_onboarding`'s status endpoint) — never build a UI that expects them from
 * this call.
 *
 * `DealerCapabilities` matches `@gift/api-client`'s own type (re-exported, not redeclared) except
 * this file also types the `id`/`updatedAt` the real `serializeCapabilities` always includes
 * (`updatedAt: null` for a dealer who has never saved capabilities yet, never a bare `null`
 * response) — see `commands/shared.ts`'s `serializeCapabilities`, read directly.
 *
 * Type-only file by convention (see dashboard/types.ts's own note for why): validators.ts and
 * other pure-logic siblings are loaded directly by `node --test`, and this app's `@/...` alias
 * only resolves for the TypeScript compiler, not Node's plain ESM loader — a type-only import
 * through it is erased before resolution is attempted, but a value import throws
 * `ERR_MODULE_NOT_FOUND`. Keeping this file 100% types keeps it safe to import by alias from
 * those files.
 */
import type { BusinessType, KycStatus, PrintingMethod as WirePrintingMethod } from '@gift/api-client'

export type { BusinessType, KycStatus }

export interface DealerCapabilitiesWire {
  id?: string
  productTypeCodes: string[]
  printingMethods: WirePrintingMethod[]
  maxDailyCapacity: number
  serviceableStates: string[]
  minOrderQty: number
  /** `null` when the dealer has never saved capabilities yet — never a bare `null` response. */
  updatedAt: string | null
}

/** GET /api/dealer_org_rbac/dealer/profile — read-only identity fields + capabilities. */
export interface DealerOrgProfile {
  id: string
  organizationId: string
  tenantId: string
  businessName: string
  contactEmail: string
  phone: string
  businessType: BusinessType
  city: string
  state: string
  pincode: string
  kycStatus: KycStatus
  rejectionReason: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  approvedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  capabilities: DealerCapabilitiesWire
}

/** Local, in-progress edit state for the capabilities form — numbers may be `''` mid-edit so an
 *  emptied input is representable (and therefore validatable as "required") rather than silently
 *  coerced to 0. */
export interface CapabilitiesFormValues {
  productTypeCodes: string[]
  printingMethods: string[]
  maxDailyCapacity: number | ''
  serviceableStates: string[]
  minOrderQty: number | ''
}

export type FieldErrors = Record<string, string>
