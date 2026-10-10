---
id: TASK-03
title: API client core — http wrapper, env, money, idempotency, errors
status: Done (sandbox-verified — see spec/mobile/IMPLEMENTATION-NOTES.md)
---

# TASK-03 — API client core

## Objective

Build the low-level plumbing every domain API call (TASK-04) sits on top of: a typed fetch wrapper, env config, money conversion, idempotency key generation, and a typed error class. This task can run fully in parallel with TASK-01/02 — it has no dependency on the scaffold existing, since it's a pure TypeScript module (verify it compiles with `tsc` against a minimal `tsconfig.json`; it will be dropped into `apps/mobile/src/lib/api/` once TASK-01 lands).

## Boundaries

**You own:** `apps/mobile/src/lib/api/http.ts`, `env.ts`, `money.ts`, `idempotency.ts`, `errors.ts`.

**Do not touch:** `src/lib/api/{catalog,occasions,cart,checkout,orders,addresses,payments}.ts` (TASK-04 owns those), anything under `src/features/**`, `src/components/**`, `src/theme/**`, navigation, `package.json`/`app.json`.

## Key backend facts this module must encode

- **Base URL**: read from `EXPO_PUBLIC_API_BASE_URL` (set by TASK-01's `.env.example`; dev value is `http://localhost:3000`, confirmed from the repo root `.env`'s `APP_URL`). On a physical device, this must be a LAN IP, not `localhost` — document this in a code comment, do not hardcode a fallback that silently breaks on-device.
- **Tenant/org scope**: the backend resolves scope via (1) custom domain, (2) signed-in session, (3) `organizationId`/`orgSlug` **query parameter**. Since this app has no custom domain, `apiRequest()` must append `organizationId` (or `orgSlug`) from env to **every** request's query string automatically — callers in TASK-04 should never have to pass it manually.
- **Session/cart cookies**: the backend sets `sf_cart_token`, `sf_order_access`, `customer_auth_token` as httpOnly cookies — there is **no `Authorization: Bearer` support anywhere** in the storefront API (confirmed by grep). React Native's `fetch` runs on the native HTTP stack (OkHttp on Android, NSURLSession on iOS), which automatically persists and resends cookies for the same origin — unlike a browser's JS sandbox, no manual cookie-jar code is needed. **Do not build a cookie shim.** Just use the global `fetch` as-is and let the native layer handle cookie persistence. Document this assumption clearly in a comment in `http.ts` so nobody "fixes" it later by adding unnecessary cookie-parsing code.
- **Idempotency-Key header**: required on `POST /checkout/orders` and `POST /orders/{id}/payment-session` (16–128 chars). `idempotency.ts` generates one; `http.ts` must accept an optional `idempotencyKey` option and set the `Idempotency-Key` header when provided.
- **Money**: every endpoint sends/receives **decimal major-unit INR** (e.g. `499.00`) on the wire. `money.ts` converts to/from integer minor units (paise) for internal app state, exactly mirroring `apps/storefront/src/lib/money.ts`:
  - `toMinorUnits(major: number): number` — decimal → integer minor, rounds.
  - `toMajorUnits(minor: number): number` — integer minor → decimal, for outgoing requests.
  - `formatMoney(major: number, currencyCode?: string): string` — `Intl.NumberFormat('en-IN', { style: 'currency', currency: currencyCode ?? 'INR' })`.
  - **Never do raw float arithmetic on money** anywhere downstream — every domain function in TASK-04 must convert at the boundary and do math in integer minor units.

## Contracts produced

`src/lib/api/env.ts`:
```ts
export interface AppEnv {
  apiBaseUrl: string
  organizationId?: string
  orgSlug?: string
  razorpayKeyId: string
}
export const env: AppEnv
// Reads from apps/mobile/src/lib/config.ts (rawConfig, created by TASK-01) and
// throws a clear startup error if apiBaseUrl is missing, and if BOTH
// organizationId and orgSlug are missing (at least one is required).
```

`src/lib/api/errors.ts`:
```ts
export class ApiError extends Error {
  code: string
  status: number
  details?: unknown
  constructor(message: string, opts: { code: string; status: number; details?: unknown })
}
```

`src/lib/api/idempotency.ts`:
```ts
export function newIdempotencyKey(): string // uuid v4 or equivalent, 16-128 char constraint satisfied
```

`src/lib/api/money.ts`:
```ts
export function toMinorUnits(majorDecimal: number): number
export function toMajorUnits(minor: number): number
export function formatMoney(majorDecimal: number, currencyCode?: string): string
```

`src/lib/api/http.ts`:
```ts
export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  idempotencyKey?: string
}

// Performs the request against `${env.apiBaseUrl}${path}`, injects organizationId/orgSlug
// into the query string, JSON-encodes `body`, sets Idempotency-Key when `idempotencyKey`
// is provided, parses the JSON response, and validates it against `schema` (zod) before
// returning. Throws ApiError on a non-2xx response or a schema mismatch.
export async function apiRequest<T>(
  path: string,
  schema: import('zod').ZodType<T>,
  options?: ApiRequestOptions,
): Promise<T>
```

## Backend endpoints used

None directly — this is infrastructure consumed by TASK-04.

## Acceptance criteria

- `apiRequest()` against a mocked/stubbed fetch correctly appends `organizationId`/`orgSlug` to every call's query string, regardless of whether `options.query` was passed.
- `apiRequest()` sets `Idempotency-Key` only when `idempotencyKey` is explicitly passed — never on GETs.
- A non-2xx JSON response matching the backend's error envelope shapes (`{error, code, details?}` for CRUD-style endpoints, `{ok:false, error}` for customer_accounts-style endpoints) is normalized into a thrown `ApiError` with `.code` and `.status` populated in both cases.
- `toMinorUnits(499)` → `49900`; `toMajorUnits(49900)` → `499`; `formatMoney(499)` → a string containing `₹499` (exact formatting per `Intl.NumberFormat('en-IN', ...)`).
- Module compiles standalone with `tsc --noEmit` given only `zod` as an external dependency (no React Native imports in these five files — keep them platform-agnostic so they're easy to unit test with plain Jest/Node if desired later).

## Dependencies to add

```
zod
```

## Non-goals

- No cookie-jar shim or manual `Cookie:` header handling (see rationale above).
- No retry/backoff logic — a single attempt per call is sufficient for v1.
- No request caching (TanStack Query, added per-feature in TASK-05/06, handles caching at a higher layer).
