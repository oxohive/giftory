import type { StorefrontAddress } from '../data/entities'

/** Address book wire shape (matches the storefront's `storedAddressSchema`). */
export type SerializedAddress = {
  id: string
  fullName: string
  phone: string
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: 'IN'
  isDefault: boolean
  updatedAt: string | null
}

export function serializeAddress(address: StorefrontAddress): SerializedAddress {
  return {
    id: String(address.id),
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: 'IN',
    isDefault: Boolean(address.isDefault),
    updatedAt: address.updatedAt ? new Date(address.updatedAt).toISOString() : null,
  }
}
