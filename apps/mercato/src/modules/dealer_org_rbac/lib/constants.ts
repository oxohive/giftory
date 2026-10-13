export const DEALER_ORG_MODULE_ID = 'dealer_org_rbac' as const

// ACL feature IDs
export const FEAT_DEALER_ORG_ADMIN = 'dealer_org.admin' as const
export const FEAT_DEALER_ORG_VIEW = 'dealer_org.view' as const
export const FEAT_DEALER_ORG_MANAGE_CAPABILITIES = 'dealer_org.manage_capabilities' as const
export const FEAT_DEALER_ORG_MANAGE_STAFF = 'dealer_org.manage_staff' as const

// Command IDs
export const DEALER_CAPABILITIES_UPSERT_COMMAND = 'dealer_org_rbac.capabilities.upsert' as const
export const DEALER_STAFF_INVITE_COMMAND = 'dealer_org_rbac.staff.invite' as const

// Role names (created by dealer_onboarding setup)
export const DEALER_OWNER_ROLE = 'dealer:owner' as const
export const DEALER_STAFF_ROLE = 'dealer:staff' as const

export const PRINTING_METHODS = [
  'sublimation',
  'dtg',
  'laser_engraving',
  'uv_print',
  'offset',
] as const

// ISO 3166-2:IN state codes
export const INDIAN_STATE_CODES = [
  'IN-AN', 'IN-AP', 'IN-AR', 'IN-AS', 'IN-BR', 'IN-CH', 'IN-CT', 'IN-DD',
  'IN-DL', 'IN-DN', 'IN-GA', 'IN-GJ', 'IN-HP', 'IN-HR', 'IN-JH', 'IN-JK',
  'IN-KA', 'IN-KL', 'IN-LA', 'IN-LD', 'IN-MH', 'IN-ML', 'IN-MN', 'IN-MP',
  'IN-MZ', 'IN-NL', 'IN-OR', 'IN-PB', 'IN-PY', 'IN-RJ', 'IN-SK', 'IN-TG',
  'IN-TN', 'IN-TR', 'IN-UP', 'IN-UT', 'IN-WB',
] as const
