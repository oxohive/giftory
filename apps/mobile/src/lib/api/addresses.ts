import { z } from 'zod'
import { apiRequest } from './http'
import type { Address } from './checkout'

/**
 * Customer address book — `apps/mercato`'s `storefront` module account routes, called directly.
 * **All require a signed-in customer** — every call 401s until real auth exists (guest-only v1);
 * TASK-08's UI handles that via "requires account" gating. This module just surfaces the 401 as a
 * typed `ApiError` (no catch/fallback — unlike `apps/storefront`'s equivalent, which falls back to
 * a device-local `localStorage` address book; that fallback is deliberately not ported here since
 * TASK-04's non-goals/boundaries scope this to typed I/O only):
 *
 *   GET    /api/storefront/account/addresses          -> { items: StoredAddress[] }
 *   POST   /api/storefront/account/addresses          -> { item: StoredAddress }  (201)
 *   PUT    /api/storefront/account/addresses/{id}     -> { item: StoredAddress }
 *   DELETE /api/storefront/account/addresses/{id}     -> { ok: true }
 */

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const

/**
 * India-specific validation, ported verbatim (same regexes/messages) from
 * `apps/storefront/src/lib/api/addresses.ts`'s `addressSchema`: a 10-digit Indian mobile number
 * (optionally `+91`-prefixed) and a 6-digit PIN code not starting with 0. TASK-07's checkout /
 * address form reuses this schema rather than re-implementing the validators.
 */
export const addressSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the recipient name').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  line1: z.string().trim().min(3, 'Enter house / flat and street').max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter a city').max(100),
  state: z.string().trim().min(2, 'Choose a state'),
  postalCode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
  country: z.literal('IN'),
})

export interface StoredAddress extends Address {
  id: string
  isDefault: boolean
}

const storedAddressWireSchema = z
  .object({
    id: z.string(),
    fullName: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string().nullable().optional(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string(),
    isDefault: z.boolean().nullable().optional(),
  })
  .passthrough()

const addressListWireSchema = z.object({ items: z.array(storedAddressWireSchema) }).passthrough()
const addressItemWireSchema = z.object({ item: storedAddressWireSchema }).passthrough()

function toStoredAddress(wire: z.infer<typeof storedAddressWireSchema>): StoredAddress {
  return {
    id: wire.id,
    fullName: wire.fullName,
    phone: wire.phone,
    line1: wire.line1,
    line2: wire.line2 ?? undefined,
    city: wire.city,
    state: wire.state,
    postalCode: wire.postalCode,
    country: wire.country,
    isDefault: wire.isDefault ?? false,
  }
}

export async function listAddresses(): Promise<StoredAddress[]> {
  const res = await apiRequest('/api/storefront/account/addresses', addressListWireSchema)
  return res.items.map(toStoredAddress)
}

export async function createAddress(input: Address): Promise<StoredAddress> {
  const res = await apiRequest('/api/storefront/account/addresses', addressItemWireSchema, {
    method: 'POST',
    body: input,
  })
  return toStoredAddress(res.item)
}

export async function updateAddress(id: string, patch: Partial<Address>): Promise<StoredAddress> {
  const res = await apiRequest(`/api/storefront/account/addresses/${encodeURIComponent(id)}`, addressItemWireSchema, {
    method: 'PUT',
    body: patch,
  })
  return toStoredAddress(res.item)
}

export async function deleteAddress(id: string): Promise<void> {
  await apiRequest(`/api/storefront/account/addresses/${encodeURIComponent(id)}`, z.unknown(), {
    method: 'DELETE',
  })
}
