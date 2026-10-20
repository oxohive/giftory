/**
 * App-local re-export of @gift/ui's money/rate helpers. Every amount from the five Phase 2
 * dealer-marketplace modules is already integer paise — call formatMoney directly on it, never
 * through toMinorUnits first. See tasks/phase-2-ui/API-CONTRACTS.md's "Money" convention.
 */
export { formatBps, formatMoney, toMajorUnits, toMinorUnits } from '@gift/ui'
