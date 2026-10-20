# P2-UI-00: API contracts — Phase 2 dealer marketplace

Produced by: P2-UI-00 (contract audit and implementation preflight).
Audited against commit `f70b310` and the working tree, 2026-10-13.
Source of truth: the route files under `apps/mercato/src/modules/{dealer_onboarding,dealer_org_rbac,dealer_orders,commissions,payouts}/`, their `acl.ts`/`setup.ts`, the shared `@open-mercato/core` auth commands/services, and `docs/dealer-marketplace-api.md` (which this document independently re-verified against source, not merely restated).

**Read the [Critical backend gaps](#critical-backend-gaps) section first.** Two of the gaps listed there mean dealer-facing endpoints across three modules are currently unreachable by any dealer user. No UI task may treat those endpoints as usable until the fix lands (tracked in TASK-02 / TASK-03). Gaps 1–3 were fixed by TASK-02; Gap 7 (a newer, equally severe finding — the admin order-assignment flow queried a nonexistent table — see below) was fixed by TASK-03. Gaps 4–6 (payouts/commissions idempotency, balance guard, adjustment-credit semantics) remain open — out of TASK-02/03's owned paths.

---

## Conventions (verified)

- **Routing:** the generated manifest serves every route at `/api/<moduleId>/<path-under-api/>` via the catch-all dispatcher `apps/mercato/src/app/api/[...slug]/route.ts`. Example: `dealer_orders/api/admin/orders/[id]/assignment/route.ts` is served at `POST /api/dealer_orders/admin/orders/[id]/assignment`. The shorter, module-less form used in the feature specs (`POST /api/admin/orders/:id/assignment`) 404s. **Treat every path below as module-prefixed; the spec files under `spec/phase-2/features/` use the unprefixed form and are wrong for implementation purposes.**
- **Auth:** no dedicated dealer login endpoint. Dealer users (`dealer:owner` / `dealer:staff`) authenticate through the shared core-auth endpoints: `POST /api/auth/login` (sets httpOnly `auth_token` + `session_token` cookies), `POST /api/auth/session/refresh`, `POST /api/auth/logout`.
- **Authorization:** declarative per-method `metadata.requireFeatures`, enforced by the dispatcher via `rbacService.userHasAllFeatures(...)`. `requireRoles` is deprecated and ignored everywhere in this codebase — never gate a P2 UI screen on a role name.
- **Scope derivation:** `scope.tenantId` is derived from the session on every route (verified on every route read for this audit — sound). `scope.organizationId` similarly. **Dealer identity** (`dealerProfileId`) is a different story — see Gap 3 below.
- **Standard response shapes:**

  | Case | Status | Body |
  |---|---|---|
  | Unauthenticated | 401 | `{"error":"Unauthorized"}` |
  | Missing feature | 403 | `{"error":"Forbidden","requiredFeatures":[...]}` |
  | Validation failure | 422 | `{"error":"Invalid request","code":"invalid_request","details":[{"path","message"}]}` |
  | Command error (badRequest/notFound/conflict) | 400/404/409 | `{"error":"<msg>","code":"request_failed"}` |
  | Missing/invalid path id | 400 | `{"error":"invalid_id"}` |
  | Unhandled | 500 | `{"error":...,"code":"internal_error"}` |

- **Pagination:** every list route takes `page` (≥1, default 1) and `pageSize` (1–100, default 25), returns `{"items":[...],"total","page","pageSize"}` (some admin routes add `"totalPages"` — noted per-endpoint below).
- **Money:** integer paise (INR) everywhere in these five modules — commission amounts, subtotal, ledger amounts, balances. `currencyCode` is always `"INR"`. **These values are already minor units** — do **not** run `packages/ui/src/money.ts`'s `toMinorUnits()` on anything from these modules; that helper exists for Phase 1 storefront values that arrive from Open Mercato core as decimal major units. Running it on an already-integer-paise value from `commissions`/`payouts` double-converts (treats paise as rupees). Use `formatMoney()` directly.
- **Rates:** basis points (`rateBps`, `commissionRateBps`); 100 bps = 1%; hard max 10000.
- **Dates:** `requiredBy`, `effectiveFrom`, `effectiveTo` are `YYYY-MM-DD`. Timestamps are ISO-8601, nullable where noted. No explicit timezone conversion happens server-side; treat all timestamps as UTC instants and format for `Asia/Kolkata` client-side (see `packages/ui/src/index.tsx` `formatDate`, which already does this).

---

## Critical backend gaps

Ordered by severity. **Gaps 1 and 2 are new findings from this audit, not previously documented anywhere in the repo.** Gaps 3–6 restate (and independently re-verify against source) the gaps already recorded in `docs/dealer-marketplace-api.md`.

### Gap 1 (new, severe) — `*.dealer_access` features are declared but never granted to any dealer role

`dealer_orders.dealer_access`, `commissions.dealer_access`, and `payouts.dealer_access` are declared in each module's `acl.ts` and required by every dealer-facing route in those three modules:

- `GET /api/dealer_orders/dealer/orders`, `GET .../dealer/orders/{id}`, `POST .../dealer/orders/{id}/status`
- `GET /api/commissions/dealer/earnings`, `GET .../dealer/earnings/{assignmentId}`
- `GET /api/payouts/dealer/ledger`, `GET .../dealer/ledger/balance`

Grepping the entire `apps/mercato/src/` tree for `dealer_access` turns up exactly these declarations and `requireFeatures` usages — **no `setup.ts` anywhere grants any of the three features to `dealer:owner` or `dealer:staff`**:

```
// dealer_orders/setup.ts, commissions/setup.ts, payouts/setup.ts (all three, verbatim pattern)
defaultRoleFeatures: {
  superadmin: ['<module>.*'],
  admin: ['<module>.view', '<module>.manage'],
  employee: ['<module>.view'],
}
```

No `dealer:owner`/`dealer:staff` key exists in any of the three. The only place that scopes the `dealer:owner` role's ACL (`dealer_onboarding/commands/review.ts`, `scopeDealerRoleToOrg`) grants exactly `['dealer_onboarding.view_own', 'dealer_onboarding.submit']` — nothing from `dealer_orders`, `commissions`, or `payouts`.

**Effect: as the backend stands today, no dealer user — owner or staff — can ever successfully call any dealer-facing order, earnings, or ledger endpoint.** Every one of those calls returns `403 {"error":"Forbidden","requiredFeatures":["<module>.dealer_access"]}` regardless of KYC approval status. This is *not* caught by the 267 passing unit tests because those tests mock the command bus / RBAC layer rather than exercising real ACL resolution end-to-end.

This directly blocks: TASK-09 (assigned orders list), TASK-10 (order detail/status), TASK-14 (dealer earnings/ledger). It also undermines the "owner vs staff earnings access" question below, since *neither* currently has access.

**Required fix (owned by TASK-02/TASK-03, lane A):** add `dealer:owner` (and, per FEAT-009's staff restriction intent, explicitly *not* `dealer:staff` for `commissions.dealer_access`/`payouts.dealer_access`) to each module's `defaultRoleFeatures`, and run `yarn mercato auth sync-role-acls` for any already-provisioned tenant. `dealer_orders.dealer_access` should go to both `dealer:owner` and `dealer:staff` (FEAT-009: staff can view/update orders); `commissions.dealer_access` and `payouts.dealer_access` should go to `dealer:owner` only (FEAT-009 explicitly: "Staff cannot access commission or payout data").

### Gap 2 (new, severe) — approving a dealer clobbers the shared `dealer:owner` role ACL for every dealer in the tenant, and locks out every still-pending dealer

Per ADR-003, `dealer:owner` and `dealer:staff` are **single, tenant-wide, shared roles** — every dealer owner across every dealer org shares one `Role` row and one `RoleAcl` row per tenant; isolation comes entirely from `RoleAcl.organizationsJson`.

`dealer_onboarding/commands/review.ts`'s `scopeDealerRoleToOrg` (called on every `POST .../approve`) calls the core `auth.role-acl.update` command with:

```ts
{
  roleId: role.id,
  tenantId,
  organizations: [...existingOrgs, organizationId],
  features: ['dealer_onboarding.view_own', 'dealer_onboarding.submit'],
}
```

The core command's persistence (`@open-mercato/core/src/modules/auth/commands/acl.ts`, `updateRoleAclCommand.persist`) does a **straight replace**, not a merge: `acl.featuresJson = input.features`. (Contrast with `ensureRoleAclFor` in `setup-app.ts`, used only at tenant-creation time, which *does* merge via `Array.from(new Set([...currentFeatures, ...uniqueFeatures]))`.)

Consequences, both confirmed by reading `rbacService.ts`'s organization-scope evaluation (`organizationsJson == null` or `[]` ⇒ unrestricted/all-orgs; a non-empty array without `'__all__'` ⇒ restricted to exactly those orgs):

1. **Feature clobbering.** At tenant creation, `dealer:owner`'s `RoleAcl.featuresJson` is correctly seeded as the union of `dealer_onboarding`'s and `dealer_org_rbac`'s `defaultRoleFeatures` (`dealer_onboarding.view_own`, `dealer_onboarding.submit`, `dealer_org.view`, `dealer_org.manage_capabilities`, `dealer_org.manage_staff`). The **first** `POST .../approve` call in the tenant overwrites `featuresJson` down to just the two onboarding features — wiping `dealer_org.view` / `.manage_capabilities` / `.manage_staff` for **every dealer owner in the tenant**, not only the one being approved. `GET /api/dealer_org_rbac/dealer/profile`, `PUT .../dealer/profile/capabilities`, and `POST .../dealer/staff/invite` all 403 for all dealer owners from that point on.
2. **Org-scope lockout of pending dealers.** The same call changes `organizationsJson` from `null`/unset (unrestricted — any org) to a concrete list (`[orgA]`, then `[orgA, orgB]`, ...). Any `dealer:owner` whose org is **not yet** in that list — i.e. every dealer still mid-KYC — loses every grant from this role, **including `dealer_onboarding.view_own`**. So once *any* dealer in the tenant has been approved, a *different*, still-pending dealer gets `403` on `GET /api/dealer_onboarding/dealer/onboarding/status` — they cannot even check their own application status.

The existing unit test (`dealer_onboarding/__tests__/review.commands.test.ts`, `'calls auth.role-acl.update when role is found...'`) only asserts `roleAclCall[1].input.organizations.toContain(ORG_ID)` — it never asserts on `features`, so this clobbering is unguarded by any test.

**This is the single biggest blocker for multi-dealer correctness.** With only one dealer ever approved in a tenant it is *partially* masked (that one dealer still loses `dealer_org.*` access to themselves, but there's no second pending dealer to demonstrate the lockout) — so a shallow "approve one dealer and click around" smoke test will not surface it. TASK-02/03 must fix `scopeDealerRoleToOrg` to merge features (reuse `ensureRoleAclFor`'s merge semantics, or read-merge-write) before any UI task that exercises more than one dealer per tenant (TASK-05 through TASK-16, in any tenant with ≥2 dealers) can be verified end to end.

### Gap 3 (already known, re-verified) — dealer-level data isolation is not enforced

`docs/dealer-marketplace-api.md` already documents this; this audit re-read every route named below and confirms it is current:

- `GET /api/dealer_orders/dealer/orders` — `dealerProfileId` is an **optional query parameter**; omitted, it returns every dealer's assignments in the tenant (`dealer_orders/api/dealer/orders/route.ts`).
- `GET /api/commissions/dealer/earnings` — same pattern (`commissions/api/dealer/earnings/route.ts`).
- `GET /api/payouts/dealer/ledger` — `dealerProfileId` optional; omitted, returns every dealer's ledger entries in the tenant.
- `GET /api/payouts/dealer/ledger/balance` — `dealerProfileId` is **required** as a query param (`400` if absent) and is never compared against the caller's session.
- `GET /api/dealer_orders/dealer/orders/{id}` and `POST .../dealer/orders/{id}/status` filter the assignment by `tenantId` only (not `dealerProfileId`), so a dealer principal can read or transition another dealer's assignment by guessing/enumerating its id.

Combined with Gap 1, this means: once Gap 1 is fixed and a dealer *can* reach these routes, they can still see/act on **every other dealer's data** unless Gap 3 is also fixed. **TASK-02 must fix both together** — fixing only Gap 1 without Gap 3 would ship a working-looking but cross-dealer-leaky API.

### Gap 4 (already known, re-verified) — `Idempotency-Key` required but not consumed

`POST`/`PUT /api/dealer_orders/admin/orders/{id}/assignment` require the header (400 `idempotency_key_required` if missing — verified in `lib/http.ts`'s `requireIdempotencyKey`), but no replay store exists; a retried request with the same key still executes. The `409` on an existing active assignment is what actually stops most duplicate *assigns* (not reassigns). Payout and adjustment routes (`payouts/commands/entries.ts`) take no idempotency key at all and have no other duplicate guard — a retried `POST .../ledger/payout` or `.../ledger/adjustment` double-records.

### Gap 5 (already known, re-verified) — no balance-sufficiency guard on payout recording

`recordPayoutCommand` (`payouts/commands/entries.ts`) appends a `payout_disbursed` debit unconditionally — verified no balance check anywhere in the command. A payout larger than the dealer's earned balance is accepted and drives `pendingAmount` negative.

### Gap 6 (already known, re-verified) — `adjustment_credit` does not increase `pendingAmount`

Both balance routes (`payouts/api/dealer/ledger/balance/route.ts`, `payouts/api/admin/dealers/[id]/ledger/balance/route.ts`) run the identical SQL:

```sql
totalEarned  = SUM(amount) WHERE direction='credit' AND entry_type='commission_earned'
totalDebited = SUM(amount) WHERE direction='debit'
pendingAmount = totalEarned - totalDebited
```

`adjustment_credit` is a `credit` direction row but is **excluded** from `totalEarned` (the `entry_type='commission_earned'` filter excludes it) and not subtracted either — it has no effect on `pendingAmount`. `adjustment_debit` *does* reduce `pendingAmount` (any `debit` direction counts) and can drive it negative. Any admin-facing ledger UI (TASK-16) must not claim adjustment credits "top up the balance" — as coded, they currently do not.

### Gap 7 (new, severe, fixed by TASK-03) — `dealer_orders`' `assertOrderIsPaid` queried a table that does not exist

`dealer_orders/commands/assignments.ts`'s `assertOrderIsPaid` (gates every `POST`/`PUT /admin/orders/{id}/assignment`) ran `SELECT id FROM orders WHERE ...`. **No table named `orders` exists in this app's schema** — Phase 1 checkout writes `SalesOrder` rows to `sales_orders` (verified against `storefront/lib/checkout.ts`'s `createSalesOrder`). Every unit test mocks `em.getConnection().execute(...)`, so the wrong table name was never exercised against a real database; against a real Postgres instance **every admin order assignment would fail with `relation "orders" does not exist`** — the dealer assignment flow has never worked end to end. **Fixed in TASK-03**: the query now reads `sales_orders`. Regression test: `dealer_orders/__tests__/assertOrderIsPaid.test.ts`.

**`commissions/subscribers/snapshot-on-assignment.ts` has the identical bug** (`FROM orders o`, plus `order_lines`/`gifts` for the product type lookup) — same root cause, same fix needed, but that file is outside TASK-03's owned paths (commissions/payouts are owned by a concurrent lane). Flagging here for that lane/the coordinator; not fixed by this task.

---

## `dealer_onboarding` (FEAT-008)

KYC lifecycle: `pending_verification → under_review → approved | rejected`, and `rejected → under_review` on resubmit.

Business types: `proprietorship | partnership | pvt_ltd | llp`. Document types: `gst_certificate | pan_card | address_proof`. Max 10 MB; mime types `application/pdf`, `image/jpeg|png|webp|tiff`.

| Method & path | Caller | Feature | Status |
|---|---|---|---|
| `POST /api/dealer_onboarding/dealer/onboarding/register` | Public | `requireAuth:false`, 5 req/h | **Verified working** |
| `GET /api/dealer_onboarding/dealer/onboarding/status` | Dealer | `dealer_onboarding.view_own` | **Verified working, but see Gap 2** — breaks for pending dealers once any other dealer in the tenant is approved |
| `POST /api/dealer_onboarding/dealer/onboarding/documents` | Dealer | `dealer_onboarding.submit`, 20 req/h | **Implemented (TASK-03)** — real file upload, see below |
| `GET /api/dealer_onboarding/dealer/onboarding/documents/{id}/file` | Dealer | `dealer_onboarding.view_own` | **New (TASK-03)** — download the caller's own KYC document |
| `GET /api/dealer_onboarding/admin/dealers/applications/{id}/documents/{documentId}/file` | Admin | `dealer_onboarding.admin` | **New (TASK-03)** — admin review download |
| `POST /api/dealer_onboarding/dealer/onboarding/resubmit` | Dealer | `dealer_onboarding.submit` | Same Gap 2 exposure |
| `GET /api/dealer_onboarding/admin/dealers/applications` | Admin | `dealer_onboarding.admin` | **Verified working** |
| `GET /api/dealer_onboarding/admin/dealers/applications/{id}` | Admin | `dealer_onboarding.admin` | **Verified working** |
| `POST /api/dealer_onboarding/admin/dealers/applications/{id}/approve` | Admin | `dealer_onboarding.admin` | **Verified working, but triggers Gap 2** |
| `POST /api/dealer_onboarding/admin/dealers/applications/{id}/reject` | Admin | `dealer_onboarding.admin` | **Verified working** |

### `POST .../register`
Body: `organizationId` (uuid — the marketplace org used to resolve the platform tenant), `businessName` (2–200), `contactEmail`, `phone`, `gstin` (GSTIN regex), `pan` (PAN regex), `businessType`, `city`, `state` (2 uppercase letters), `pincode` (6 digits).
`201 {"id","message"}` · `404 org_not_found` · `409` duplicate email in tenant · `422` validation · `429` rate-limited.
Creates an inactive backend organization, a `DealerProfile` with `kycStatus:"pending_verification"`, and a `dealer:owner` user (invite email sent). Runs as a system actor. **Open item:** `organizationId` is caller-chosen on an unauthenticated route — rate-limited to 5/h and the org must exist, but tenant selection is caller-controlled (backend hardening follow-up, not a UI blocker).

### `GET .../status`
`200` profile (`id, organizationId, tenantId, businessName, contactEmail, phone, businessType, city, state, pincode, kycStatus, rejectionReason, reviewedBy, reviewedAt, approvedAt, createdAt, updatedAt`) + `documents[]` (`id, dealerProfileId, tenantId, documentType, storageKey, fileName, fileSizeBytes, mimeType, uploadedAt`). `404 profile_not_found` when no profile exists for the session's org. Scope is correctly session-derived (`auth.orgId`/`auth.tenantId`), unlike the Gap-3 routes.

### `POST .../documents` — real file upload (TASK-03)
**No longer metadata-only.** Body is now `multipart/form-data`: `documentType` field + `file` field (the actual bytes). The route uploads the file to private, access-controlled object storage via the installed `attachments` module's `attachmentService.createScoped` (never a hand-rolled S3 call, never a presigned-URL dance — direct authenticated multipart upload through this route, which this codebase's `attachments` module already supports end to end). `fileName`/`mimeType`/`fileSizeBytes` recorded on the `DealerKycDocument` row are the REAL, server-sniffed values from the uploaded bytes, never client-declared. Mime type is checked twice (declared, pre-upload; sniffed, post-upload) against the allowlist (`application/pdf`, `image/jpeg|png|webp|tiff`); size capped at 10 MB. `storageKey` is now the resulting attachment's id (server-generated UUID), never caller-chosen.
`201 {"id","documentType","fileName"}` · `400` when status is not `pending_verification`/`under_review`, file too large, or unsupported mime type · `404` no profile · `422` missing file/documentType.
Idempotent per type (existing active doc of the same type is soft-deleted — the underlying attachment is not released, a known minor storage-hygiene gap). First upload advances the profile to `under_review`.

### Download — `GET .../documents/{id}/file` (dealer) and `GET .../applications/{id}/documents/{documentId}/file` (admin) (TASK-03)
Streams the stored file bytes. **Fails closed**: the dealer route re-resolves the caller's OWN profile (session-derived) and 404s if the requested document doesn't belong to it; the admin route resolves the application by id within the admin's tenant and 404s if the requested document doesn't belong to THAT application. Only after that check does either route call `attachmentService.readScoped(...)` — the admin route necessarily reads with the scope (tenantId/orgId) of the DEALER being reviewed, not the admin's own, since the attachment is stored under the dealer's org; this is the documented "scope switch after authorization" pattern (see `attachmentService.readScoped`'s own doc comment) and grants nothing beyond the one document already authorized by the two checks above. Verified with tests exercising cross-dealer and cross-tenant document ids directly against the data-access layer (`dealer_onboarding/__tests__/kycDocumentAccess.test.ts`) — not just code review.

### `POST .../resubmit`
Body: any subset of registration fields + `note` (≤2000, accepted but not persisted — do not build a UI affordance implying the note is saved anywhere).
`200 {"ok":true}` · `400` when `kycStatus !== "rejected"`. Repeatable.

### Admin queue — `GET /admin/dealers/applications`
Query: `kycStatus?`, `search?` (business name or contact email), `page`, `pageSize`, `sortField` (`created_at|updated_at|business_name|kyc_status`), `sortDir`. `200 {items,total,page,pageSize,totalPages}`.

### Admin detail — `GET /admin/dealers/applications/{id}`
`200` profile + **decrypted** `gstin`/`pan` + `documents[]`. `404` when not found in tenant. **Backend hardening note (not a UI blocker):** decryption scope uses the profile id rather than the organization id — cosmetic for the UI, flagged for backend follow-up only.

### `POST .../approve`
No body. `200 {"ok":true}` · `400` unless current status is `under_review` · `404`. Gap 2 is fixed (TASK-02) — the UI's approval success toast may now accurately say the dealer can log in and manage their profile/staff. **TASK-03:** now also emits `dealer_onboarding.profile.approved`, which a persistent subscriber (`subscribers/notify-dealer-on-approval.ts`) turns into a real email to the dealer's `contactEmail`, via the shared `sendEmail` pipeline, linking to the dealer portal login page. Verified with a test exercising the real send pipeline (`OM_TEST_MODE` capture), not a mock of `sendEmail`.

### `POST .../reject`
Body: `reason` (1–2000, required). `200 {"ok":true}` · `400` from `pending_verification`/`under_review` only · `404`. **TASK-03:** emits `dealer_onboarding.profile.rejected`; `subscribers/notify-dealer-on-rejection.ts` sends a real email including the rejection reason and a login link — once logged in, the dealer can `GET .../onboarding/status` (to see the reason again) and `POST .../onboarding/resubmit`. This is the "pending/rejected applicants need a secure way to check their own status" requirement — satisfied by login + the existing status endpoint, not an unauthenticated token in the email.

**Email delivery note (both routes):** links use `DEALER_PORTAL_BASE_URL` (new env var, mirrors the `PLATFORM_PORTAL_BASE_URL` lesson from spec/phase-1 Gap G7) — falls back to `http://localhost:3200` outside production, throws loudly if unset in production rather than mailing a dead localhost link. The dealer-portal app itself (TASK-01) does not exist yet, so the link's destination page is not yet live; the link's construction, the event wiring, and the real send are all verified now regardless.

---

## `dealer_org_rbac` (FEAT-009)

Capabilities enums: `printingMethods ∈ {sublimation, dtg, laser_engraving, uv_print, offset}`; `serviceableStates` ∈ the 37 `IN-XX` state codes.

| Method & path | Caller | Feature | Status |
|---|---|---|---|
| `GET /api/dealer_org_rbac/dealer/profile` | Dealer | `dealer_org.view` | **Broken by Gap 2** after first approval in tenant |
| `PUT /api/dealer_org_rbac/dealer/profile/capabilities` | Dealer owner | `dealer_org.manage_capabilities` | **Broken by Gap 2** after first approval in tenant |
| `POST /api/dealer_org_rbac/dealer/staff/invite` | Dealer owner | `dealer_org.manage_staff` | **Implemented (TASK-02/03)** |
| `GET /api/dealer_org_rbac/dealer/staff` | Dealer owner | `dealer_org.manage_staff` | **New (TASK-03)** — owner+staff roster, scoped to caller's own org |
| `POST /api/dealer_org_rbac/dealer/staff/{id}/deactivate` | Dealer owner | `dealer_org.manage_staff` | **New (TASK-03)** — resolves the "staff deactivate" gap CONTRACT-HANDOFF.md flagged as missing |
| `GET /api/dealer_org_rbac/admin/dealers` | Admin | `dealer_org.admin` | **Verified working** |
| `GET /api/dealer_org_rbac/admin/dealers/{id}` | Admin | `dealer_org.admin` | **Verified working** |
| `PUT /api/dealer_org_rbac/admin/dealers/{id}/capabilities` | Admin | `dealer_org.admin` | **Verified working** |

### `GET .../dealer/profile` — resolved "business-profile edit scope" question
`200` profile + `capabilities` (`productTypeCodes[]`, `printingMethods[]`, `maxDailyCapacity`, `serviceableStates[]`, `minOrderQty`, `updatedAt`; defaults `[]/0/1/null`). Requires an **approved** profile (`404` while still in KYC — this is intentional per the route's own code, confirmed).

**There is no dealer-facing endpoint to edit core business-identity fields** (`businessName`, `contactEmail`, `phone`, `gstin`, `pan`, `city`, `state`, `pincode`) after approval. The only dealer-facing `PUT` in this module edits **capabilities only**. Pre-approval, the *only* way to change business-identity fields is `POST /dealer/onboarding/resubmit`, and only while `kycStatus === "rejected"`. **TASK-06's "profile" screen must be scoped to capabilities-editing only** — any UI affordance for editing business name/GSTIN/etc. post-approval would be building against a contract that does not exist. If the product requirement is to let an approved dealer correct a typo in their business info, that is a new backend endpoint and must be raised as a proposed addition to TASK-03, not assumed to exist.

### `PUT .../dealer/profile/capabilities`
Strict body (unknown keys → 422): `productTypeCodes?` (≤100), `printingMethods?` (≤5), `maxDailyCapacity?` (0–100000), `serviceableStates?`, `minOrderQty?` (1–10000). Full replace (upsert). `200` resulting object. `404` when profile is not approved. **No version/`updatedAt` check on write** — see [Optimistic concurrency](CONTRACT-HANDOFF.md#optimistic-concurrency) in the handoff doc; last write wins today.

### `POST .../dealer/staff/invite`
Strict body: `email`, `name?`. `201 {"userId","email"}` · `404` no approved profile. Creates a `dealer:staff` user with an invite email. Staff receive **only** `dealer_onboarding.view_own` + `dealer_org.view` (per `dealer_org_rbac/setup.ts` — verified: staff do *not* get `manage_capabilities`/`manage_staff`, and, per Gap 1, do not currently get `dealer_orders.dealer_access` either until that gap is fixed).

### `GET .../dealer/staff` and `POST .../dealer/staff/{id}/deactivate` (TASK-03) — resolved "staff deactivate" question
CONTRACT-HANDOFF.md flagged "no staff-list/deactivate endpoint exists" as a gap for TASK-07 to either request or descope. Both now exist:
- `GET .../dealer/staff` → `{"items":[{id,email,name,role,isActive,lastLoginAt,createdAt}]}` — the dealer org's owner+staff roster, read via the INSTALLED auth module's own `User`/`Role`/`UserRole` entities (`findWithDecryption` for the encrypted `email` column — never raw SQL on `users`, which would return ciphertext).
- `POST .../dealer/staff/{id}/deactivate` → `{"userId","deactivated":true}` · `400` if `id` is the caller's own id (an owner can never deactivate themselves) · `404` if `id` doesn't resolve as a `dealer:staff` member of the caller's own org (never another org's user, never a `dealer:owner`). Deactivation calls the installed `auth.users.update` command with `isConfirmed: false` — the SAME flag the auth module's session-integrity check (re-run on every authenticated request) and login route both honor, so this is a real access revocation, not a flag nothing checks.

### Admin directory
`GET /admin/dealers` lists **approved dealers only**, tenant-scoped, `businessName ASC`, `search?`, `state?`, pagination; each item includes a batch-loaded `capabilities` object. `GET /admin/dealers/{id}` — single dealer; `404` if not approved. `PUT /admin/dealers/{id}/capabilities` — admin full-replace of a dealer's capabilities; `400` if dealer not approved.

---

## `dealer_orders` (FEAT-011) — resolved "assignment-ID vs order-ID" question

Assignment statuses: `assigned | acknowledged | in_production | ready_for_dispatch | dispatched | cancelled`. Allowed transitions: `assigned → acknowledged → in_production → ready_for_dispatch → dispatched`. `dispatched`/`cancelled` are terminal.

**The id in the path means different things on the admin side vs. the dealer side — this is a real asymmetry, not a documentation error, and every UI task must get it right:**

| Method & path | `{id}` means | Caller | Feature | Status |
|---|---|---|---|---|
| `GET /api/dealer_orders/admin/orders/{id}/assignment` | **Order ID** | Admin | `dealer_orders.view` | Verified |
| `POST /api/dealer_orders/admin/orders/{id}/assignment` | **Order ID** | Admin | `dealer_orders.manage` | Verified |
| `PUT /api/dealer_orders/admin/orders/{id}/assignment` | **Order ID** | Admin | `dealer_orders.manage` | Verified |
| `DELETE /api/dealer_orders/admin/orders/{id}/assignment` | **Order ID** | Admin | `dealer_orders.manage` | Verified |
| `GET /api/dealer_orders/admin/dealers/{dealerId}/orders` | `dealerId` = dealer profile ID | Admin | `dealer_orders.view` | Verified |
| `GET /api/dealer_orders/dealer/orders` | n/a (list) | Dealer | `dealer_orders.dealer_access` | **Implemented (TASK-02/03)** — supports `sortField` (`assignedAt`\|`requiredBy`) + `sortDir`, server-side (DB-level sort-then-paginate, not a client-side page sort) |
| `GET /api/dealer_orders/dealer/orders/{id}` | **Assignment ID** (OpenAPI doc comment confirms: `pathParams: { id: ... .describe('Assignment ID') }`) | Dealer | `dealer_orders.dealer_access` | **Implemented (TASK-02/03)** — see "Safe dealer order detail" below for the TASK-03 payload change |
| `POST /api/dealer_orders/dealer/orders/{id}/status` | **Assignment ID** (route reads `id` into `assignmentId`) | Dealer | `dealer_orders.dealer_access` | **Implemented (TASK-02/03)** — accepts optional `updatedAt` for optimistic concurrency (409 on stale write; omitted = unchanged last-write-wins, backward compatible) |
| `GET /api/dealer_orders/dealer/dashboard` | n/a | Dealer | `dealer_orders.dealer_access` | **New (TASK-03)** — order-status aggregates; see "Dashboard aggregates" below |
| `GET /api/dealer_orders/admin/orders/{id}/assignments` (plural) | **Order ID** | Admin | `dealer_orders.view` | **New (TASK-03)** — full assignment history including cancelled/superseded rows, newest first. Resolves the "assignment history" open question below |

So: the admin assignment routes are keyed by the **order's** id (because they answer "what is this order's current assignment"); the dealer-facing detail/status routes are keyed by the **assignment's** id (because a dealer may have had multiple assignments over time for different orders, and the one id that is unambiguous to them is the assignment id they were notified about). TASK-09/TASK-10 must carry `assignment.id`, not `assignment.orderId`, as the route param when linking from the dealer's order list into order detail/status-update.

Serialized assignment: `id, orderId, dealerProfileId, tenantId, organizationId, assignedBy, assignedAt, requiredBy, status, statusUpdatedAt, statusNote, cancelledReason, updatedAt`.

### `POST /admin/orders/{id}/assignment` — resolved "eligible-dealer filtering" question
Headers: `Idempotency-Key` **required** (400 `idempotency_key_required` if missing — not consumed, see Gap 4).
Body: `orderId` (uuid), `dealerProfileId` (uuid), `requiredBy` (`YYYY-MM-DD`, future).
`201 {"id"}` · `400` when order is not `payment_status='paid'` · `409` when an active assignment already exists. **Fixed by TASK-03 (Gap 7):** the paid-status check previously queried a nonexistent `orders` table and would have failed every real assignment attempt — see the Gap 7 writeup above. Emits `dealer_order.assigned`; `subscribers/notify-dealer-on-assignment.ts` now sends the dealer a REAL email (previously a TODO-only log stub) with the production deadline and a link to the assignment, resolving FEAT-011/US-005 AC #4 ("the dealer receives an email notification"). Verified end-to-end (event → DealerProfile contact-email lookup → real `sendEmail` capture) in `dealer_orders/__tests__/notifyOnAssignment.test.ts`.

**There is no server-side eligible-dealer filter.** The command accepts any `dealerProfileId` with zero validation against the order's product types or the dealer's declared capabilities (`productTypeCodes`, `serviceableStates`, `maxDailyCapacity`). FEAT-011 AC #2 ("The assignment UI shows only dealers whose capabilities include the product types in the order") is **not implemented anywhere in the backend.**

**TASK-13 (admin order assignment UI) must implement this filter client-side**, using data that already exists:
1. Fetch the order's line items (core sales module, outside these five modules — TASK-13 must confirm the exact admin order-detail endpoint it already has access to for product type codes per line).
2. `GET /api/dealer_org_rbac/admin/dealers` returns every approved dealer **with a batch-loaded `capabilities` object already attached** — no extra round trip needed.
3. Filter client-side: dealer is eligible if every product type on the order appears in `capabilities.productTypeCodes`, the order's delivery state is in `capabilities.serviceableStates` (if that's available on the order), and the order's line quantity doesn't obviously exceed `maxDailyCapacity`/`minOrderQty`. Treat this as a *display hint*, not an enforced constraint — the backend will accept an assignment to an "ineligible" dealer without complaint.
This is a genuine capability gap, not a UI implementation detail; if product wants a hard server-side block, that is a new validation in `dealer_orders/commands/assignments.ts` and should be raised as a proposed addition to TASK-03.

### `PUT /admin/orders/{id}/assignment` — reassign
Same idempotency-key requirement. Body adds `reason?` (1–500). `200 {"id"}` (**new** assignment's id) · `404` no active assignment · `400` order not paid. Soft-cancels current, inserts fresh `assigned` row.

### `DELETE /admin/orders/{id}/assignment` — cancel
Body: `reason` (required, 1–500). No idempotency key. `200 {"ok":true}` · `404` no active assignment.

### `GET /admin/orders/{id}/assignment` — resolved "assignment history" question
`200 {"assignment": {...} | null}` — **never 404s**; returns the single **currently-active** (non-cancelled) assignment or `null`. **There is no endpoint that returns an order's full assignment history** (including cancelled/superseded rows from past reassignments). FEAT-011 AC #7 ("The order detail in the admin panel shows current assignment status and history") is **only half-implemented** — current status, yes; history, no.

The data to support history already exists in the table (reassignment soft-cancels the old row and inserts a new one; nothing is ever hard-deleted), but no route projects it. **Proposed, not yet implemented:** `GET /api/dealer_orders/admin/orders/{id}/assignments` (plural) returning all rows for the order including cancelled ones, ordered by `assignedAt DESC`. TASK-13 (admin assignment UI, which is the only task needing history) should either request this as a TASK-03 addition, or — if history display is not a hard requirement for the initial cut — ship without it and note the gap in that task's handoff. Do not build a history UI against a guessed endpoint shape.

### Safe dealer order detail — `GET .../dealer/orders/{id}` response shape (TASK-03)

Previously returned the bare serialized assignment (internal scope/audit fields included). Now returns the FEAT-010-scoped safe projection only:

```
{
  assignmentId, orderId, orderNumber, status, statusNote, statusUpdatedAt,
  requiredBy, assignedAt, updatedAt,
  lines: [{ id, productId, variantId, name, quantity, giftMessage, productionRequirements }],
  shipping: { city, pincode }
}
```

`assignmentId` and `orderId` are both present and intentionally distinct (`orderId` is read-only reference data, paired with `orderNumber`; the dealer portal routes by `assignmentId` only). Excludes `dealerProfileId`/`tenantId`/`organizationId`/`assignedBy`/`cancelledReason` and all customer PII/payment data — sourced via raw SQL against `sales_orders`/`sales_order_lines` (mirrors the existing `assertOrderIsPaid` cross-module-read pattern). `productionRequirements` is `sales_order_lines.configuration` (catalog customization payload) merged with any free-text `comment`; `giftMessage` is read from `metadata.gift.giftMessage` (same shape storefront uses). `shipping.pincode` is `shipping_address_snapshot.postalCode`. See `dealer_orders/lib/orderDetails.ts`.

### Dashboard aggregates — `GET .../dealer/dashboard` (TASK-03)

```json
{ "pendingAcknowledgment": 3, "inProduction": 1, "dispatchedThisWeek": 2, "weekStartsAt": "2026-01-04T18:30:00.000Z", "timezone": "Asia/Kolkata" }
```

Computed as ONE SQL aggregate (`COUNT(*) FILTER (...)`) scoped to the caller's own `dealerProfileId`, never by summing/filtering pages of `GET /dealer/orders` — that would silently undercount past the first page. `dispatchedThisWeek` uses an explicit Asia/Kolkata week boundary (most recent Monday 00:00 IST, converted to its UTC instant) — see `dealer_orders/lib/dateWindows.ts`'s `startOfIstWeek`; `weekStartsAt` is returned so the client can render the exact boundary used. This endpoint only covers `dealer_orders`' own counts — TASK-08 (dealer dashboard) must separately call the already-correct aggregate endpoints `GET /payouts/dealer/ledger/balance` (SQL `SUM`, not a page sum) and `GET /dealer_org_rbac/dealer/profile` (for `capabilities.maxDailyCapacity`) and compose them client-side; no single cross-module dashboard endpoint was added (would require an ORM/SQL join across module-owned tables, which this repo's module-isolation convention forbids).

### `POST .../dealer/orders/{id}/status` — dealer status update
Body: `status` (any value except `assigned`/`cancelled`), `note?` (≤500). `200 {"ok":true}` · `400` invalid transition or cancelled assignment · `404` not found. `statusNote` is **overwritten**, not appended — a status-history/notes-timeline UI (if desired) cannot be built from this field; only the single latest note is ever retained. Emits `dealer_order.status_updated`.

---

## `commissions` (FEAT-012)

| Method & path | Caller | Feature | Status |
|---|---|---|---|
| `GET /api/commissions/dealer/earnings` | Dealer | `commissions.dealer_access` | **Blocked — Gap 1, Gap 3** |
| `GET /api/commissions/dealer/earnings/{assignmentId}` | Dealer | `commissions.dealer_access` | **Blocked — Gap 1, Gap 3** |
| `GET /api/commissions/admin/commission/rules` | Admin | `commissions.view` | Verified |
| `POST /api/commissions/admin/commission/rules` | Admin | `commissions.manage` | Verified |
| `GET /api/commissions/admin/commission/rules/{id}` | Admin | `commissions.view` | Verified |
| `DELETE /api/commissions/admin/commission/rules/{id}` | Admin | `commissions.manage` | Verified |
| `GET /api/commissions/admin/orders/{id}/commission` | Admin | `commissions.view` | Verified (`{id}` = order ID) |
| `GET /api/commissions/admin/dealers/{dealerId}/commission` | Admin | `commissions.view` | Verified (`{dealerId}` = dealer profile ID) |

Serialized rule: `id, dealerProfileId (nullable=platform-wide), productTypeCode (nullable), rateBps (1–10000), effectiveFrom, effectiveTo (nullable), createdBy, createdAt`. **No `updatedAt`** — rules are append-only by design (deactivation sets `effectiveTo`, never mutates rate/dates).
Serialized snapshot: `id, assignmentId, orderId, dealerProfileId, subtotalAmount (paise), currencyCode, commissionRateBps, commissionAmount (paise), ruleId, snapshottedAt`.

### Rate resolution — resolved "inactive-rule filtering" question
`lib/rateResolver.ts`: newest matching rule wins where `effectiveFrom <= today AND (effectiveTo IS NULL OR effectiveTo > today)`, priority **dealer+productType → dealer-default → platform-default**. No match ⇒ `rateBps:0, ruleId:null`. `commissionAmount = round(subtotalAmountPaise * rateBps / 10000)`, integer-only (verified: `Math.round((subtotalAmountPaise * rateBps) / 10_000)`, no float division without round).

**Boolean parsing of `activeOnly`, verified directly in `data/validators.ts` and the list route — this is a real, reproducible bug, not a type-signature artifact:**

```ts
activeOnly: z.coerce.boolean().default(true)
```

`z.coerce.boolean()` runs JS `Boolean(value)` on whatever string the query param carries. **Any non-empty string — including the literal text `"false"` — coerces to `true`.** `GET .../admin/commission/rules?activeOnly=false` therefore still filters to active rules only (`WHERE effectiveTo IS NULL`), the opposite of what the parameter name suggests. The **only** way to include deactivated rules is to pass the key with an **empty** value: `?activeOnly=` (empty string → `Boolean("") === false`), or omit `activeOnly` handling entirely and rely on the schema default being overridden by an explicit empty value. **TASK-15 (admin commission management) must build its "show deactivated rules" toggle to send `activeOnly=` (empty string), never `activeOnly=false`.** This is exploitable as a real footgun in a naive `<Switch>`-to-query-string binding; call it out in that task's implementation notes directly, not just here.

### Rules lifecycle
`POST` creates with `effectiveTo:null`. **No overlap guard** — overlapping rules resolve by latest `effectiveFrom` at read time, so admins can create confusing overlapping rules with no server-side warning; TASK-15's rule-creation form should at minimum show existing rules for the same dealer/productType scope so the admin can see an overlap before saving. `DELETE` is a soft deactivate (`effectiveTo = today`); `400` if already deactivated; never hard-deleted. Snapshots are immutable — later rule edits never affect past orders.

### Caveats
No de-duplication on `assignmentId` for snapshots — a redelivered `dealer_order.assigned` event could in principle create two snapshots for the same assignment (no unique index). Low likelihood in Phase 2 (no event replay mechanism exercised yet) but worth a defensive "has this assignment already got a snapshot" display check if TASK-14/16 ever shows raw snapshot counts.

---

## `payouts` (FEAT-013) — resolved "running ledger balance" question

| Method & path | Caller | Feature | Status |
|---|---|---|---|
| `GET /api/payouts/dealer/ledger` | Dealer | `payouts.dealer_access` | **Blocked — Gap 1, Gap 3** |
| `GET /api/payouts/dealer/ledger/balance` | Dealer | `payouts.dealer_access` | **Blocked — Gap 1, Gap 3** (also requires `dealerProfileId` as a query param — Gap 3) |
| `GET /api/payouts/admin/dealers/{id}/ledger` | Admin | `payouts.view` | Verified |
| `GET /api/payouts/admin/dealers/{id}/ledger/balance` | Admin | `payouts.view` | Verified |
| `POST /api/payouts/admin/dealers/{id}/ledger/payout` | Admin | `payouts.manage` | Verified, but see Gap 4/5 |
| `POST /api/payouts/admin/dealers/{id}/ledger/adjustment` | Admin | `payouts.manage` | Verified, but see Gap 6 |

Serialized entry: `id, dealerProfileId, tenantId, entryType, amount (paise), currencyCode, direction, referenceType, referenceId, note, createdBy, createdAt`. **No `updatedAt`** — append-only by design, no update/delete route exists anywhere in this module (verified: no `PUT`/`PATCH`/`DELETE` route files under `payouts/api/`).

**`GET .../ledger` (both dealer and admin variants) returns raw paginated entries only — there is no per-entry running balance in the response.** Each row has `amount` + `direction`; there is no cumulative `balanceAfter` column computed or returned. FEAT-013 AC #5 ("An admin can view the full ledger for any dealer, with running balance") is implemented only as a **separate aggregate** (`GET .../ledger/balance` → `{pendingAmount, totalEarned}`), not as a per-row running total alongside the list.

**Computing a true running balance client-side across pages is fragile** (requires fetching every earlier page to accumulate a running sum before rendering page N) and is **not recommended**. **Proposed, not yet implemented:** either (a) add a `balanceAfter` column to the serialized ledger entry, computed server-side at query time with a window function, or (b) accept that TASK-14/16 display the aggregate balance (`pendingAmount`/`totalEarned`) prominently and the paginated list as a plain chronological log *without* a running-balance column. **Recommendation: ship (b) for the initial cut** — it is accurate to what the backend actually provides — and file (a) as a backend enhancement if product specifically wants the running-total column.

### Balance math — reconfirmed from source (both routes run byte-identical SQL)
```
totalEarned   = Σ amount WHERE direction='credit' AND entry_type='commission_earned'
totalDebited  = Σ amount WHERE direction='debit'
pendingAmount = totalEarned - totalDebited
```
`pendingAmount` can go negative (Gap 5: no payout balance guard; Gap 6: `adjustment_debit` reduces it with no floor). Any ledger UI must render negative `pendingAmount` as a valid, expected state, not treat it as a bug to hide.

### `POST .../ledger/payout`
Body: `amount` (positive, paise), `note` (1–500, the payment reference/UTR). `201 {"id"}`. No balance check, no idempotency key (Gap 4/5) — **the UI should add its own confirm-before-submit guard comparing the entered amount against the current `pendingAmount`**, since the backend will not.

### `POST .../ledger/adjustment`
Body: `direction` (`credit|debit`), `amount` (positive, paise), `note` (**required**, 1–500, the audit reason). `201 {"id"}`. See Gap 6 for the asymmetric effect on `pendingAmount`.

---

## Resolved open questions — summary table

| Question | Answer (verified against source) |
|---|---|
| Owner vs staff earnings access | **Neither currently has access** (Gap 1). Once fixed: `commissions.dealer_access`/`payouts.dealer_access` should go to `dealer:owner` only; `dealer_orders.dealer_access` to both owner and staff. FEAT-010's "staff: no financial access" intent is correct product direction but is not yet encoded anywhere. |
| KYC pending-user authentication | A pending dealer logs in through the normal core-auth endpoints immediately after registration (no special "pending" auth mode) and can call `GET .../onboarding/status` via the `dealer_onboarding.view_own` grant — **but this breaks (403) for any still-pending dealer once any other dealer in the tenant has been approved** (Gap 2). |
| Assignment-ID vs order-ID | Admin routes key off **order ID**. Dealer-facing detail/status routes key off **assignment ID**. See the `dealer_orders` table above for the exact per-route breakdown. |
| Assignment history | **Implemented (TASK-03):** `GET /api/dealer_orders/admin/orders/{id}/assignments` (plural) returns every row for the order, including cancelled/superseded, newest first. |
| Running ledger balance | **Explicitly descoped from TASK-03** — `payouts/` is owned by a concurrent lane and out of TASK-03's owned paths. No per-entry running balance exists; only the aggregate `{pendingAmount, totalEarned}` endpoint. Decision stands as originally recommended: build UI against the aggregate + a plain chronological list, not a computed running column. If a running-balance column is still wanted, that is a new window-function query in `payouts/api/.../ledger/route.ts`, to be raised with whichever lane owns `payouts/` next. |
| Eligible-dealer filtering | **Confirmed, no new endpoint added (TASK-03).** No server-side filter exists or was added — `GET /admin/dealers` already returns every approved dealer with capabilities batch-loaded, which is correct, non-paginated data (not the "summing a page" problem the running-balance case has). TASK-13 filters client-side against the order's product types, per the original recommendation. |
| Business-profile edit scope | Dealer-facing `PUT` only covers **capabilities** (`productTypeCodes`, `printingMethods`, `maxDailyCapacity`, `serviceableStates`, `minOrderQty`). No endpoint edits business-identity fields (name/GSTIN/PAN/contact/address) post-approval; those are editable only pre-approval via `resubmit` while `kycStatus==="rejected"`. |
| Inactive-rule filtering / boolean parsing | Confirmed bug: `activeOnly=false` is coerced to `true` by `z.coerce.boolean()`. Only an **empty** `activeOnly=` value yields `false`. |

---

## UI task → contract mapping

Every P2-UI task from 04 onward is listed here with its required contracts and current status, so none is ambiguous per this task's acceptance criteria.

| Task | Needs | Status |
|---|---|---|
| TASK-01 (scaffold) | No backend contract — shared UI/package wiring only | Not blocked by backend |
| TASK-02 (dealer authZ prerequisite) | Fix Gap 1, Gap 2, Gap 3 | **This is where Gaps 1–3 must be fixed** |
| TASK-03 (missing APIs) | Decide on assignment-history endpoint, running-balance approach, eligible-dealer-filter approach | **Done.** Assignment history: implemented (`GET .../admin/orders/{id}/assignments`). Running balance: explicitly descoped (payouts out of this task's owned paths). Eligible-dealer filter: confirmed client-side, no new endpoint (per the original recommendation). Also fixed a severe, previously-undiscovered bug (Gap 7: `assertOrderIsPaid` queried a nonexistent `orders` table — see above), added real KYC file upload/download, staff list/deactivate, order-detail safe payload, dashboard aggregates, and optimistic-concurrency 409s on capabilities/status-update. |
| TASK-04 (dealer auth/access states) | Core-auth login/refresh/logout + `dealer_onboarding.view_own` status check | Verified working **except** Gap 2's multi-dealer lockout — must be fixed first or TASK-04's "pending" state is untestable with >1 dealer |
| TASK-05 (registration/KYC) | `dealer_onboarding` register/status/documents/resubmit | Verified working; Gap 2 fixed by TASK-02. Object-storage question resolved by TASK-03: no pre-signed-URL step — `POST .../documents` is a direct `multipart/form-data` upload; download via `GET .../documents/{id}/file` |
| TASK-06 (profile/capabilities) | `dealer_org_rbac` profile/capabilities GET+PUT | Blocked by Gap 2 until fixed; scope is capabilities-only (see above) |
| TASK-07 (staff management) | `dealer_org_rbac` staff/invite/list/deactivate | Gap 2 fixed by TASK-02. Staff list + deactivate implemented by TASK-03 (`GET .../dealer/staff`, `POST .../dealer/staff/{id}/deactivate`) — FEAT-010's "invite, deactivate" page description is now fully contracted. |
| TASK-08 (dashboard) | Aggregates across `dealer_orders`/`commissions`/`payouts` dealer routes | Gaps 1–3 fixed by TASK-02. `dealer_orders` aggregate added by TASK-03 (`GET .../dealer/dashboard`); compose client-side with the already-correct `commissions`/`payouts` aggregate endpoints (see "Dashboard aggregates" above) |
| TASK-09 (orders list) | `GET /dealer_orders/dealer/orders` | Gaps 1–3 fixed by TASK-02. Server-side `sortField=requiredBy` sorting added by TASK-03. |
| TASK-10 (order detail/status) | `GET`/`POST /dealer_orders/dealer/orders/{assignmentId}...` | Gaps 1–3 fixed by TASK-02. TASK-03 changed the detail response to the safe FEAT-010 projection (see above) and added an optional `updatedAt` optimistic-concurrency check (409 on stale write) to the status-update route. |
| TASK-11 (admin KYC review) | `dealer_onboarding` admin routes | Verified working |
| TASK-12 (admin dealer directory) | `dealer_org_rbac` admin routes | Verified working |
| TASK-13 (admin assignment UI) | `dealer_orders` admin routes + client-side eligible-dealer filter + history endpoint | Verified working for assign/reassign/cancel/current-status (and now actually reaches a real `sales_orders` row — see Gap 7). History: implemented (`GET .../admin/orders/{id}/assignments`). Eligible-dealer filter: confirmed client-side (no new endpoint — see above). |
| TASK-14 (dealer earnings/ledger) | `commissions`/`payouts` dealer routes | Blocked by Gap 1, Gap 3; running-balance approach decided above |
| TASK-15 (admin commission mgmt) | `commissions` admin routes | Verified working; `activeOnly` boolean bug documented above |
| TASK-16 (admin ledger/payout) | `payouts` admin routes | Verified working; no balance guard/idempotency (Gap 4/5), adjustment-credit semantics (Gap 6) |
| TASK-17 (integration/regression) | All of the above, post-fix | Cannot be verified until TASK-02/03 land |
| TASK-18 (delivery docs) | N/A | Depends on TASK-17 |

No task in this table is left without either a verified contract or a named, specific prerequisite.
