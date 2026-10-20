/**
 * Money helpers — re-exported from @gift/ui so the storefront and the dealer portal share one
 * implementation (P2-UI-01's "minimal parity-preserving integration"; see
 * tasks/phase-2-ui/CONTRACT-HANDOFF.md). Behavior is unchanged: the storefront still works in
 * integer minor units (paise for INR), and Open Mercato's decimal major-unit prices still go
 * through `toMinorUnits` first.
 */
export { formatMoney, toMajorUnits, toMinorUnits } from '@gift/ui/money'
