/** Total page count for a `{total, pageSize}` list response. Never less than 1. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
}
