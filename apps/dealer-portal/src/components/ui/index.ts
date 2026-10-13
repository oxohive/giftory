/**
 * App-local re-export of @gift/ui, so dealer-portal code imports `@/components/ui` the same
 * way storefront code imports `@/components/ui/<name>` — and so a portal-only override can be
 * introduced here later without every call site changing its import.
 */
export * from '@gift/ui'
