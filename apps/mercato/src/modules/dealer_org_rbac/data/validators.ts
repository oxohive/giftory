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
    /**
     * Optimistic-concurrency version check (repo convention: editable
     * records expose `updated_at`; clients send it back; a mismatch is a
     * 409). Optional and backward compatible — an existing client that
     * doesn't send it gets the prior last-write-wins behavior unchanged;
     * a client that does send it gets a real 409 on a stale write instead
     * of silently clobbering a concurrent change. See
     * `commands/capabilities.ts`'s `executeCapabilitiesUpsert`.
     */
    updatedAt: z.string().datetime().optional(),
  })
  .strict()

export const staffInviteSchema = z
  .object({
    email: z.string().trim().email().max(255),
    name: z.string().trim().min(1).max(255).optional(),
  })
  .strict()

export const staffDeactivateSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .strict()

export type CapabilitiesUpsertInput = z.infer<typeof capabilitiesUpsertSchema>
export type StaffInviteInput = z.infer<typeof staffInviteSchema>
export type StaffDeactivateInput = z.infer<typeof staffDeactivateSchema>
