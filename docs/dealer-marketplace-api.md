# Dealer marketplace API reference (Phase 2)

Covers the five Phase 2 backend modules: `dealer_onboarding` (FEAT-008), `dealer_org_rbac` (FEAT-009), `dealer_orders` (FEAT-011), `commissions` (FEAT-012) and `payouts` (FEAT-013).

Source of truth: the route files under `apps/mercato/src/modules/<module>/api/`. This document was produced by reading every route file directly (audited 2026-10-14) and reflects the code as written.

## Conventions

### Route paths are module-prefixed

All routes are registered by the generated manifest and served by the catch-all dispatcher `apps/mercato/src/app/api/[...slug]/route.ts` at:

```
/api/<moduleId>/<path-under-api/>
```

For example the assignment route that lives in `dealer_orders/api/admin/orders/[id]/assignment/route.ts` is served at `POST /api/dealer_orders/admin/orders/[id]/assignment`, **not** `POST /api/admin/orders/[id]/assignment`. The shorter module-less form 404s. In-file doc comments and `docs/phase-2-testing-guide.md` use the shorter form in places; treat the module-prefixed path as authoritative.

### Authentication and authorization

There is no separate dealer login API. Dealer users are ordinary backend users created with the role `dealer:owner` or `dealer:staff`, and they authenticate through the shared core-auth endpoints:

| Action | Endpoint |
|---|---|
| Login | `POST /api/auth/login` (sets httpOnly `auth_token` + `session_token` cookies) |
| Refresh | `POST /api/auth/session/refresh` |
| Logout | `POST /api/auth/logout` |

Authorization is declarative, per route method, via the `metadata` export enforced by the dispatcher:

- `requireAuth` (default on) → `401 {"error":"Unauthorized"}`
- `requireFeatures` → checked with `rbacService.userHasAllFeatures(...)` → `403 {"error":"Forbidden","requiredFeatures":[...]}`. `requireRoles` is deprecated and ignored.
- `rateLimit` → `429`, keyed by IP.

Feature grants come from each module's `setup.ts`. `superadmin`/`admin` receive the `*.admin`/`view`/`manage` features; `dealer:owner` receives dealer-facing features; `dealer:staff` receives only `dealer_onboarding.view_own` and `dealer_org.view`.

Inside handlers, scope is derived from the session only (`auth.tenantId`, `auth.orgId`, `auth.sub`). Client-supplied `tenantId`/`organizationId` in bodies are stripped by zod. **Tenant** scoping is sound on every route. **Dealer-level** isolation is not (see [Known gaps](#known-gaps)).

### Standard responses

| Case | Status | Body |
|---|---|---|
| Unauthenticated | 401 | `{"error":"Unauthorized"}` |
| Missing feature | 403 | `{"error":"Forbidden","requiredFeatures":[...]}` |
| Validation failure | 422 | `{"error":"Invalid request","code":"invalid_request","details":[{"path","message"}]}` |
| Command error (`badRequest`/`notFound`/`conflict`) | 400/404/409 | `{"error":"<msg>","code":"request_failed"}` |
| Missing/invalid path id | 400 | `{"error":"invalid_id"}` |
| Unhandled | 500 | `{"error":...,"code":"internal_error"}` |

### Pagination and units

- All list routes: query `page` (≥1, default 1) and `pageSize` (1–100, default 25) → `200 {"items":[...],"total","page","pageSize"}`.
- All money values are **integer paise** (INR). `currencyCode` is always `"INR"`.
- All rates are **basis points** (`rateBps`, `commissionRateBps`); 100 bps = 1%; hard max 10 000.
- Dates (`requiredBy`, `effectiveFrom`, `effectiveTo`) are `YYYY-MM-DD`; timestamps are ISO-8601 strings, nullable where noted.

---

## `dealer_onboarding` — FEAT-008

KYC lifecycle: `pending_verification → under_review → approved | rejected`, and `rejected → under_review` on resubmit.

Business types: `proprietorship | partnership | pvt_ltd | llp`. Document types: `gst_certificate | pan_card | address_proof`. Max document size 10 MB; mime types `application/pdf`, `image/jpeg|png|webp|tiff`.

| Method & path | Caller | Feature |
|---|---|---|
| `POST /api/dealer_onboarding/dealer/onboarding/register` | Public | `requireAuth: false`, 5 req/h |
| `GET /api/dealer_onboarding/dealer/onboarding/status` | Dealer | `dealer_onboarding.view_own` |
| `POST /api/dealer_onboarding/dealer/onboarding/documents` | Dealer | `dealer_onboarding.submit`, 20 req/h |
| `POST /api/dealer_onboarding/dealer/onboarding/resubmit` | Dealer | `dealer_onboarding.submit` |
| `GET /api/dealer_onboarding/admin/dealers/applications` | Admin | `dealer_onboarding.admin` |
| `GET /api/dealer_onboarding/admin/dealers/applications/{id}` | Admin | `dealer_onboarding.admin` |
| `POST /api/dealer_onboarding/admin/dealers/applications/{id}/approve` | Admin | `dealer_onboarding.admin` |
| `POST /api/dealer_onboarding/admin/dealers/applications/{id}/reject` | Admin | `dealer_onboarding.admin` |

### `POST .../register` — dealer self-registration

Body: `organizationId` (uuid, the marketplace org used to resolve the platform tenant), `businessName` (2–200), `contactEmail`, `phone`, `gstin` (GSTIN regex), `pan` (PAN regex), `businessType`, `city`, `state` (2 uppercase letters), `pincode` (6 digits).

`201 {"id","message"}` · `404 org_not_found` · `409` duplicate email in tenant · `422` validation · `429` rate-limited.

Creates an inactive backend organization, a `DealerProfile` with `kycStatus: "pending_verification"`, and an owner user (invite email sent). Runs as a system actor.

### `GET .../status` — own KYC status

`200` serialized profile (`id, organizationId, tenantId, businessName, contactEmail, phone, businessType, city, state, pincode, kycStatus, rejectionReason, reviewedBy, reviewedAt, approvedAt, createdAt, updatedAt`) plus `documents[]` (`id, dealerProfileId, tenantId, documentType, storageKey, fileName, fileSizeBytes, mimeType, uploadedAt`). `404 profile_not_found` when no profile exists for the session's org.

### `POST .../documents` — record an uploaded KYC document

Body: `documentType`, `storageKey` (1–1024), `fileName`, `fileSizeBytes` (1–10 485 760), `mimeType`.

`201 {"id","documentType","fileName"}` · `400` when status is not `pending_verification`/`under_review` · `404` no profile.

Idempotent per type: an existing active document of the same type is soft-deleted (one active copy per type). The first upload advances the profile to `under_review`. The file itself must already be in object storage — this route only records the metadata; the client obtains a pre-signed URL separately.

### `POST .../resubmit` — resubmit a rejected application

Body: any subset of the registration fields plus `note` (≤2000, accepted but not persisted).

`200 {"ok":true}` · `400` when `kycStatus !== "rejected"`. Applies a partial profile update, then `rejected → under_review` and clears `rejectionReason`. Repeatable.

### `GET /admin/dealers/applications` — admin queue

Query: `kycStatus?`, `search?` (matches business name or contact email), pagination, `sortField` (`created_at|updated_at|business_name|kyc_status`), `sortDir`. `200 {items,total,page,pageSize,totalPages}`.

### `GET /admin/dealers/applications/{id}` — admin review detail

`200` profile + **decrypted** `gstin` and `pan` + `documents[]`. `404` when not found in tenant.

### `POST /admin/dealers/applications/{id}/approve`

No body. `200 {"ok":true}` · `400` unless current status is `under_review` (repeat calls are rejected, so the route is effectively idempotent-safe) · `404`.

Side effects: activates the dealer's backend organization, grants org-scoped ACL features to `dealer:owner`, sets `kycStatus="approved"` with `reviewedBy`/`reviewedAt`/`approvedAt`.

### `POST /admin/dealers/applications/{id}/reject`

Body: `reason` (1–2000, required). `200 {"ok":true}` · `400` from `pending_verification`/`under_review` only ("an approved dealer cannot be rejected") · `404`. Stores the reason; the dealer may then resubmit.

---

## `dealer_org_rbac` — FEAT-009

Capabilities enums: `printingMethods ∈ {sublimation, dtg, laser_engraving, uv_print, offset}`; `serviceableStates` ∈ the 37 `IN-XX` state codes.

| Method & path | Caller | Feature |
|---|---|---|
| `GET /api/dealer_org_rbac/dealer/profile` | Dealer | `dealer_org.view` |
| `PUT /api/dealer_org_rbac/dealer/profile/capabilities` | Dealer (owner) | `dealer_org.manage_capabilities` |
| `POST /api/dealer_org_rbac/dealer/staff/invite` | Dealer (owner) | `dealer_org.manage_staff` |
| `GET /api/dealer_org_rbac/admin/dealers` | Admin | `dealer_org.admin` |
| `GET /api/dealer_org_rbac/admin/dealers/{id}` | Admin | `dealer_org.admin` |
| `PUT /api/dealer_org_rbac/admin/dealers/{id}/capabilities` | Admin | `dealer_org.admin` |

### `GET .../dealer/profile`

`200` profile + `capabilities` (`productTypeCodes[]`, `printingMethods[]`, `maxDailyCapacity`, `serviceableStates[]`, `minOrderQty`, `updatedAt`; defaults `[]/0/1/null`).

Requires an **approved** profile — a dealer still in KYC gets `404`. This is intentional: feature grants exist pre-approval, profile reads do not.

### `PUT .../dealer/profile/capabilities`

Strict body (unknown keys → 422): `productTypeCodes?` (≤100 items), `printingMethods?` (≤5), `maxDailyCapacity?` (0–100000), `serviceableStates?`, `minOrderQty?` (1–10000). Full replace (upsert), `200` the resulting object. `404` when the profile is not approved.

### `POST .../dealer/staff/invite`

Strict body: `email`, `name?`. `201 {"userId","email"}` · `404` no approved profile. Creates a `dealer:staff` user in the caller's org with an invite email. The staff member receives only `dealer_onboarding.view_own` and `dealer_org.view` — no orders, earnings or ledger access.

### Admin dealer directory

`GET /admin/dealers` lists **approved** dealers only (tenant-scoped, `businessName ASC`, query `search?`, `state?`, pagination), each with capabilities batch-loaded. `GET /admin/dealers/{id}` returns one. `PUT /admin/dealers/{id}/capabilities` lets admin replace a dealer's capabilities (`400` if the dealer is not approved).

---

## `dealer_orders` — FEAT-011

Assignment statuses: `assigned | acknowledged | in_production | ready_for_dispatch | dispatched | cancelled`.

Allowed transitions: `assigned → acknowledged → in_production → ready_for_dispatch → dispatched`. `dispatched` and `cancelled` are terminal. `cancelled` assignments cannot be transitioned.

| Method & path | Caller | Feature |
|---|---|---|
| `GET /api/dealer_orders/dealer/orders` | Dealer | `dealer_orders.dealer_access` |
| `GET /api/dealer_orders/dealer/orders/{id}` | Dealer | `dealer_orders.dealer_access` |
| `POST /api/dealer_orders/dealer/orders/{id}/status` | Dealer | `dealer_orders.dealer_access` |
| `GET /api/dealer_orders/admin/orders/{id}/assignment` | Admin | `dealer_orders.view` |
| `POST /api/dealer_orders/admin/orders/{id}/assignment` | Admin | `dealer_orders.manage` |
| `PUT /api/dealer_orders/admin/orders/{id}/assignment` | Admin | `dealer_orders.manage` |
| `DELETE /api/dealer_orders/admin/orders/{id}/assignment` | Admin | `dealer_orders.manage` |
| `GET /api/dealer_orders/admin/dealers/{dealerId}/orders` | Admin | `dealer_orders.view` |

Serialized assignment: `id, orderId, dealerProfileId, tenantId, organizationId, assignedBy, assignedAt, requiredBy, status, statusUpdatedAt, statusNote, cancelledReason, updatedAt`.

### `POST /admin/orders/{id}/assignment` — assign

Headers: **`Idempotency-Key` is required** (400 `idempotency_key_required` when missing).

Body: `orderId` (uuid), `dealerProfileId` (uuid), `requiredBy` (`YYYY-MM-DD`, must be in the future).

`201 {"id"}` · `400` when the order is not `payment_status='paid'` · `409` when an active assignment already exists.

Inserts with `status="assigned"` and emits `dealer_order.assigned`, which drives the commission snapshot and ledger credit (see [Earnings pipeline](#earnings-pipeline)).

### `PUT /admin/orders/{id}/assignment` — reassign

Same header requirement. Body adds `reason?` (1–500). `200 {"id"}` (the **new** assignment's id) · `404` when there is no active assignment · `400` when the order is not paid. Soft-cancels the current assignment (`cancelledReason = reason ?? "Reassigned to a different dealer"`) then inserts a fresh `assigned` row. History is preserved; an order has at most one non-cancelled assignment.

### `DELETE /admin/orders/{id}/assignment` — cancel

Body: `reason` (required, 1–500). No idempotency key required. `200 {"ok":true}` · `404` when no active assignment.

### `POST .../dealer/orders/{id}/status` — dealer status update

Body: `status` (any status **except** `assigned` and `cancelled`), `note?` (≤500). `200 {"ok":true}` · `400` on an invalid transition or a cancelled assignment · `404` when not found.

`statusNote` is overwritten, not appended. Emits `dealer_order.status_updated`.

### `GET /admin/orders/{id}/assignment`

`200 {"assignment": {...} | null}` — never 404s; an order with no active assignment returns `null`. Considers only non-cancelled statuses.

---

## `commissions` — FEAT-012

| Method & path | Caller | Feature |
|---|---|---|
| `GET /api/commissions/dealer/earnings` | Dealer | `commissions.dealer_access` |
| `GET /api/commissions/dealer/earnings/{assignmentId}` | Dealer | `commissions.dealer_access` |
| `GET /api/commissions/admin/commission/rules` | Admin | `commissions.view` |
| `POST /api/commissions/admin/commission/rules` | Admin | `commissions.manage` |
| `GET /api/commissions/admin/commission/rules/{id}` | Admin | `commissions.view` |
| `DELETE /api/commissions/admin/commission/rules/{id}` | Admin | `commissions.manage` |
| `GET /api/commissions/admin/orders/{id}/commission` | Admin | `commissions.view` |
| `GET /api/commissions/admin/dealers/{dealerId}/commission` | Admin | `commissions.view` |

Serialized rule: `id, dealerProfileId (nullable = platform-wide), productTypeCode (nullable), rateBps (1–10000), effectiveFrom, effectiveTo (nullable), createdBy, createdAt`.

Serialized snapshot: `id, assignmentId, orderId, dealerProfileId, subtotalAmount (paise), currencyCode, commissionRateBps, commissionAmount (paise), ruleId, snapshottedAt`.

### Rate resolution (`lib/rateResolver.ts`)

Newest rule wins where `effectiveFrom <= today` and (`effectiveTo` is null or `> today`), tenant-scoped, priority **dealer + productType → dealer default → platform default**. No matching rule ⇒ `rateBps: 0`.

`commissionAmount = round(subtotalAmountPaise * rateBps / 10000)` — integer-only arithmetic.

### Rules lifecycle

- `POST` creates a rule with `effectiveTo: null`. **No overlap guard** — overlapping rules are resolved by latest `effectiveFrom`.
- `DELETE` is a **soft deactivate**: sets `effectiveTo` to today. `400` when already deactivated. Rules are never hard-deleted.
- Snapshots are immutable: the rate and amount are frozen at assignment time and never recomputed, so later rule edits cannot change past earnings.

### Caveats worth knowing

- `activeOnly` on the rules list uses `z.coerce.boolean()`, so any non-empty string is `true`. `?activeOnly=false` still filters to active rules; pass `?activeOnly=` (empty) to include deactivated ones.
- No de-duplication on `assignmentId` — a redelivered snapshot event could in principle create two snapshots.

---

## `payouts` — FEAT-013

| Method & path | Caller | Feature |
|---|---|---|
| `GET /api/payouts/dealer/ledger` | Dealer | `payouts.dealer_access` |
| `GET /api/payouts/dealer/ledger/balance` | Dealer | `payouts.dealer_access` |
| `GET /api/payouts/admin/dealers/{id}/ledger` | Admin | `payouts.view` |
| `GET /api/payouts/admin/dealers/{id}/ledger/balance` | Admin | `payouts.view` |
| `POST /api/payouts/admin/dealers/{id}/ledger/payout` | Admin | `payouts.manage` |
| `POST /api/payouts/admin/dealers/{id}/ledger/adjustment` | Admin | `payouts.manage` |

Serialized entry: `id, dealerProfileId, tenantId, entryType, amount (paise), currencyCode, direction, referenceType, referenceId, note, createdBy, createdAt`.

### Append-only rules

Rows are **never updated or deleted**; there are no update or delete routes or commands. Corrections are new adjustment entries. Entry types map to directions immutably: `commission_earned → credit`, `payout_disbursed → debit`, `adjustment_credit → credit`, `adjustment_debit → debit`.

### Balance math (both balance routes run identical SQL)

```
totalEarned   = Σ amount WHERE direction = 'credit' AND entry_type = 'commission_earned'
totalDebited  = Σ amount WHERE direction = 'debit'
pendingAmount = totalEarned - totalDebited
```

`pendingAmount` is "earned but not yet paid out". Note the current semantics: `adjustment_credit` is neither added to `totalEarned` nor subtracted, so it does not increase `pendingAmount`; `adjustment_debit` does reduce it and can drive the balance negative. `totalEarned` is lifetime commission only.

### `POST .../ledger/payout` — record a payout

Body: `amount` (positive, paise), `note` (1–500 — the payment reference/UTR). `201 {"id"}`. Appends a `payout_disbursed` debit with `referenceType="manual_payout"`. **No balance-sufficiency check and no idempotency key** — this records a payout that happened elsewhere; it does not itself move money. Repeated calls double-debit.

### `POST .../ledger/adjustment`

Body: `direction` (`credit|debit`), `amount` (positive, paise), `note` (**required**, 1–500 — the audit reason). `201 {"id"}`.

### `GET .../dealer/ledger/balance`

Requires `dealerProfileId` as a query parameter (400 when absent) and returns `{dealerProfileId, pendingAmount, totalEarned, currencyCode}`. See [Known gaps](#known-gaps) — the dealer id is taken from the query string, not the session.

---

## Earnings pipeline

The full chain, driven by persistent event subscribers:

1. `POST /api/dealer_orders/admin/orders/{id}/assignment` emits `dealer_order.assigned`.
2. `commissions/subscribers/snapshot-on-assignment.ts` reads the order subtotal (paise) and first line's product type, resolves the rate, writes the immutable snapshot, and emits `commission.snapshot_created`.
3. `payouts/subscribers/credit-on-snapshot.ts` runs `payouts.ledger.credit_commission`, appending a `commission_earned` credit with `referenceType="order_commission_snapshot"` and `referenceId=<snapshotId>`.

Both subscribers log and swallow errors, so a redelivered event can duplicate a credit; the `referenceType + referenceId` index is not unique. Worth keeping in mind when reasoning about balance accuracy.

---

## Known gaps

These are the integration gaps found by the audit. They are tracked as Phase 2 UI prerequisites (see `tasks/phase-2-ui/TASK-02-...md` and `TASK-03-...md`); the UI work must not paper over them with client-side checks.

1. ~~**Dealer-level data isolation is not enforced.**~~ **Fixed.** `dealerProfileId` is no longer accepted as client input on the dealer-facing list routes (orders, earnings, ledger) — the query schema explicitly `.omit({ dealerProfileId: true })`s it, and the route derives the caller's own profile id from `scope.organizationId`/`scope.tenantId` via `resolveOwnDealerProfileId()` instead (see `dealer_orders/api/dealer/orders/route.ts` and the equivalent `commissions`/`payouts` routes for the pattern). `dealer:owner`/`dealer:staff` remain one shared role per tenant — isolation is enforced by this per-route equality check, not by a role-level org allow-list (`role_acls.organizations_json`), which is why ADR-003's "Implementation pattern" section is now partially stale (see the note added there).
2. **`Idempotency-Key` is checked for presence but never consumed.** Assignment `POST`/`PUT` require the header, but no replay store exists in the command bus, so a duplicate request still executes (the 409 on an existing active assignment is what actually stops most duplicates). Payout and adjustment routes have no key requirement at all.
3. **Payout recording has no balance guard.** `POST .../ledger/payout` will happily debit more than the dealer has earned.
4. **`adjustment_credit` does not increase `pendingAmount`** (see balance math above).
5. **Admin application detail passes the profile id as the encryption-key scope** when decrypting `gstin`/`pan` rather than the organization id.
6. **`storageKey` on document upload is trusted verbatim** and echoed back to admins, with no verification that it points inside the tenant's own storage.
7. **Register accepts a client-chosen `organizationId`** on an unauthenticated route (rate-limited to 5/h, and the org must exist, but the tenant selection is caller-controlled).

Items 1–4 are the ones the UI tasks must account for; 5–7 are backend hardening follow-ups.
