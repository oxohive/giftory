/**
 * Date/time helpers. The five Phase 2 dealer-marketplace modules never convert timezones
 * server-side — timestamps are UTC instants; format them for Asia/Kolkata on the client.
 * See tasks/phase-2-ui/API-CONTRACTS.md's "Dates" convention.
 */
const KOLKATA_TIME_ZONE = 'Asia/Kolkata'

function parse(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Format a date-only (`YYYY-MM-DD`) or timestamp value, e.g. "15 Jan 2026". */
export function formatDate(value?: string | null): string {
  const date = parse(value)
  if (!date) return 'Not provided'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: KOLKATA_TIME_ZONE }).format(date)
}

/** Format an ISO timestamp with date and time, e.g. "15 Jan 2026, 3:30 pm". */
export function formatDateTime(value?: string | null): string {
  const date = parse(value)
  if (!date) return 'Not provided'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: KOLKATA_TIME_ZONE,
  }).format(date)
}
