const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000 // Asia/Kolkata is UTC+5:30, no DST.

/**
 * UTC instant corresponding to the most recent Monday 00:00 in Asia/Kolkata
 * (IST) relative to `now`. Dashboard aggregates that bucket "this week" MUST
 * use this — not the server process's local timezone, not a bare
 * `new Date()` arithmetic in UTC — because the repo's documented convention
 * (API-CONTRACTS.md) is that every Phase 2 timestamp is stored as a UTC
 * instant and displayed in Asia/Kolkata; a weekly aggregate is exactly the
 * kind of boundary that goes wrong by construction if it silently uses a
 * different timezone than the one dealers actually see dates in.
 */
export function startOfIstWeek(now: Date = new Date()): Date {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS)
  const dayOfWeek = istNow.getUTCDay() // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const istMidnight = new Date(
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() - daysSinceMonday, 0, 0, 0, 0),
  )
  return new Date(istMidnight.getTime() - IST_OFFSET_MS)
}
