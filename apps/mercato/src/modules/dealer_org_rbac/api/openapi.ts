import { z } from 'zod'
import { PRINTING_METHODS, INDIAN_STATE_CODES } from '../lib/constants'

export const adminDealerTag = 'admin-dealers'
export const dealerTag = 'dealer-profile'

export const capabilitiesWireSchema = z.object({
  id: z.string().uuid().optional(),
  productTypeCodes: z.array(z.string()),
  printingMethods: z.array(z.enum(PRINTING_METHODS)),
  maxDailyCapacity: z.number().int(),
  serviceableStates: z.array(z.enum(INDIAN_STATE_CODES)),
  minOrderQty: z.number().int(),
  updatedAt: z.string().datetime().nullable(),
})

export const dealerSummaryWireSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  businessName: z.string(),
  contactEmail: z.string().email(),
  phone: z.string(),
  businessType: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  kycStatus: z.string(),
  approvedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
})

export const dealerDetailWireSchema = dealerSummaryWireSchema.extend({
  capabilities: capabilitiesWireSchema.nullable(),
})

export const adminDealersListResponseSchema = z.object({
  items: z.array(dealerSummaryWireSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export const capabilitiesUpdateResponseSchema = capabilitiesWireSchema

export const staffInviteResponseSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
})

export function commonAdminErrors() {
  return [
    { status: 401, description: 'Authentication required' },
    { status: 403, description: 'Insufficient permissions' },
    { status: 404, description: 'Dealer not found' },
  ]
}

export function commonDealerErrors() {
  return [
    { status: 401, description: 'Authentication required' },
    { status: 403, description: 'Insufficient permissions' },
    { status: 404, description: 'Dealer profile not found or not approved' },
  ]
}
