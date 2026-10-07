import 'server-only'
import { publicEnv } from './env.public'

function optional(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

/** Server-only configuration. Importing this from a client component fails the build. */
export const serverEnv = {
  apiBaseUrl: (optional('MERCATO_INTERNAL_API_BASE_URL') ?? publicEnv.apiBaseUrl).replace(/\/+$/, ''),
  tenantId: optional('MERCATO_TENANT_ID'),
  organizationId: optional('MERCATO_ORGANIZATION_ID'),
  organizationSlug: optional('MERCATO_ORGANIZATION_SLUG'),
  salesChannelId: optional('MERCATO_SALES_CHANNEL_ID'),
}
