import { z } from 'zod'
import { PRINTING_METHODS, INDIAN_STATE_CODES } from '../lib/constants'

export const capabilitiesUpsertSchema = z
  .object({
    productTypeCodes: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
    printingMethods: z
      .array(z.enum(PRINTING_METHODS))
      .max(PRINTING_METHODS.length)
      .default([]),
    maxDailyCapacity: z.number().int().min(0).max(100_000).default(0),
    serviceableStates: z
      .array(z.enum(INDIAN_STATE_CODES))
      .max(INDIAN_STATE_CODES.length)
      .default([]),
    minOrderQty: z.number().int().min(1).max(10_000).default(1),
  })
  .strict()

export const staffInviteSchema = z
  .object({
    email: z.string().trim().email().max(255),
    name: z.string().trim().min(1).max(255).optional(),
  })
  .strict()

export type CapabilitiesUpsertInput = z.infer<typeof capabilitiesUpsertSchema>
export type StaffInviteInput = z.infer<typeof staffInviteSchema>
