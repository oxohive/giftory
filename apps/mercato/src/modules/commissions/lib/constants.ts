/** Maximum rate: 100% = 10 000 bps. */
export const MAX_RATE_BPS = 10_000

/** Minimum non-zero rate: 0.01% = 1 bps. */
export const MIN_RATE_BPS = 1

export const DEFAULT_CURRENCY_CODE = 'INR'

export const COMMISSION_RULE_ENTITY_ID = 'commissions:commission_rule' as const
export const COMMISSION_SNAPSHOT_ENTITY_ID = 'commissions:order_commission_snapshot' as const

export const COMMISSION_RULE_RESOURCE_KIND = 'commissions.commission_rule' as const
export const COMMISSION_SNAPSHOT_RESOURCE_KIND = 'commissions.order_commission_snapshot' as const

export const COMMISSION_RULE_CREATE_COMMAND = 'commissions.rules.create' as const
export const COMMISSION_RULE_DEACTIVATE_COMMAND = 'commissions.rules.deactivate' as const
export const COMMISSION_SNAPSHOT_CREATE_COMMAND = 'commissions.snapshots.create' as const
