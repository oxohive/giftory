import { z } from 'zod'
import { ApiError, bffRequest } from './http'

/**
 * Customer address book, served by the backend `storefront` module (GAP G4 closed), scoped to the
 * signed-in customer (customer session; 401 when signed out):
 *   GET    /api/storefront/account/addresses          -> { items: Address[] }   (default first)
 *   POST   /api/storefront/account/addresses          -> { item: Address }      (201; first address becomes default)
 *   PUT    /api/storefront/account/addresses/{id}     -> { item: Address }
 *   DELETE /api/storefront/account/addresses/{id}     -> { ok: true }
 * Addresses are stored encrypted at rest. If the endpoint is missing (older backend) the adapter
 * falls back to addresses stored on this device (localStorage) and reports `source: 'device'`.
 */

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
] as const

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
export type AddressInput = z.infer<typeof addressSchema>

export const storedAddressSchema = addressSchema.extend({
  id: z.string(),
  isDefault: z.boolean().optional(),
})
export type Address = z.infer<typeof storedAddressSchema>

export type AddressList = { items: Address[]; source: 'backend' | 'device' }

const STORAGE_KEY = 'sf.addresses.v1'

function readLocal(): Address[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = z.array(storedAddressSchema).safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

function writeLocal(items: Address[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // storage unavailable (private mode) — addresses simply won't persist
  }
}

function missing(error: unknown): boolean {
  return error instanceof ApiError && error.isMissingEndpoint
}

export const addressesApi = {
  async list(): Promise<AddressList> {
    try {
      const res = await bffRequest('storefront/account/addresses', z.object({ items: z.array(storedAddressSchema) }))
      return { items: res.items, source: 'backend' }
    } catch (error) {
      // Signed-out shoppers (401) only have device-local addresses.
      if (missing(error) || (error instanceof ApiError && error.isUnauthorized)) return { items: readLocal(), source: 'device' }
      throw error
    }
  },

  async create(input: AddressInput & { isDefault?: boolean }): Promise<Address> {
    try {
      const res = await bffRequest('storefront/account/addresses', z.object({ item: storedAddressSchema }), {
        method: 'POST',
        body: input,
      })
      return res.item
    } catch (error) {
      if (!missing(error)) throw error
      const items = readLocal()
      const created: Address = {
        ...input,
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
        isDefault: input.isDefault ?? items.length === 0,
      }
      const next = created.isDefault ? items.map((a) => ({ ...a, isDefault: false })) : items
      writeLocal([...next, created])
      return created
    }
  },

  async remove(id: string): Promise<void> {
    try {
      await bffRequest(`storefront/account/addresses/${encodeURIComponent(id)}`, z.unknown(), { method: 'DELETE' })
    } catch (error) {
      if (!missing(error)) throw error
      writeLocal(readLocal().filter((a) => a.id !== id))
    }
  },
}

export function formatAddress(a: AddressInput): string {
  return [a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`, 'India'].filter(Boolean).join(', ')
}
