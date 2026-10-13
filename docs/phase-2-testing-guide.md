# Phase 2 — Dealer Marketplace: Live Testing Guide

**Base URL (dev):** `http://giftory-dev-alb-398957740.ap-south-1.elb.amazonaws.com`  
**Admin panel:** `{BASE_URL}/backend/`  
**Dealer portal:** (separate app — port 3200 in dev)  
**Recommended tool:** Postman, Insomnia, or `curl`

---

## How to Use This Guide

1. Work through each section **in order** — later features depend on earlier ones.
2. Check off each `- [ ]` item as you verify it.
3. Note UUIDs as you go — you'll need them in later sections (profile ID, order ID, assignment ID etc.).
4. All monetary inputs are **INR paise** (integer). ₹100 = `10000`. Commission rates are **basis points**: 18% = `1800`.
5. All `POST`/`PUT`/`PATCH` requests need `Content-Type: application/json` header.
6. Authenticated requests need a `Authorization: Bearer <token>` header.

---

## Section 0 — Pre-flight Checklist

Before testing anything, confirm the environment is up.

- [ ] `GET {BASE_URL}/api/health` returns `200 OK`
- [ ] Admin panel loads at `{BASE_URL}/backend/`
- [ ] You have a **superadmin account** (or `admin` role) with a valid JWT token
- [ ] You have a test email inbox you can receive mail on (for dealer invite emails)
- [ ] You have a test Stripe/Razorpay order already in `paid` status (for FEAT-011 order assignment) — note its UUID as `ORDER_UUID`

---

## Section 1 — FEAT-008: Dealer Registration & KYC

### 1.1 Dealer Self-Registration (Unauthenticated)

> No auth token needed. Rate limit: 5 requests/hour per IP.

**Step 1 — Register a new dealer**

```
POST {BASE_URL}/api/dealer/onboarding/register
Content-Type: application/json

{
  "businessName": "Test Gifts Pvt Ltd",
  "contactEmail": "dealer@testgifts.in",
  "phone": "+91 98765 43210",
  "gstin": "22AAAAA0000A1Z5",
  "pan": "AAAAA0000A",
  "businessType": "pvt_ltd",
  "city": "Mumbai",
  "state": "MH",
  "pincode": "400001",
  "organizationId": "<YOUR_MARKETPLACE_ORG_UUID>"
}
```

- [ ] Response is `201 Created`
- [ ] Body contains `{ id: "<profile_uuid>" }` — save this as `PROFILE_UUID`
- [ ] `kycStatus` in response (if returned) is `pending_verification`

**Step 2 — Duplicate registration is blocked**

Send the exact same request again.

- [ ] Response is `400 Bad Request` or `409 Conflict` (not a second `201`)

**Step 3 — Invalid GSTIN is rejected**

Send with `"gstin": "INVALID123"` (wrong format).

- [ ] Response is `400 Bad Request` with validation error mentioning `gstin`

**Step 4 — Missing required fields are rejected**

Send with `businessName` removed.

- [ ] Response is `400 Bad Request`

---

### 1.2 Check Own Application Status

> Requires dealer JWT token (the user created when the dealer registered).

```
GET {BASE_URL}/api/dealer/onboarding/status
Authorization: Bearer <dealer_token>
```

- [ ] Response is `200 OK`
- [ ] `kycStatus` is `pending_verification`
- [ ] Response does **not** include `gstin` or `pan` (encrypted fields hidden from dealer)
- [ ] `documents` array is empty

---

### 1.3 KYC Document Upload

> Requires dealer JWT. Rate limit: 20 requests/hour.

**Step 1 — Upload a GST certificate**

```
POST {BASE_URL}/api/dealer/onboarding/documents
Authorization: Bearer <dealer_token>
Content-Type: application/json

{
  "documentType": "gst_certificate",
  "storageKey": "uploads/dealer/gst-cert.pdf",
  "fileName": "gst-cert.pdf",
  "fileSizeBytes": 512000,
  "mimeType": "application/pdf"
}
```

- [ ] Response is `201 Created` with `{ id: "<doc_uuid>" }`
- [ ] `GET /api/dealer/onboarding/status` now shows `kycStatus: "under_review"` (auto-advanced from `pending_verification`)
- [ ] `documents` array now contains 1 entry with `documentType: "gst_certificate"`

**Step 2 — Upload a PAN card**

Repeat with `"documentType": "pan_card"`, different `storageKey` and `fileName`.

- [ ] Response is `201 Created`
- [ ] Status endpoint now shows 2 documents

**Step 3 — Replace an existing document (soft-delete old, create new)**

Upload another `gst_certificate` with a different `storageKey`.

- [ ] Response is `201 Created`
- [ ] Status endpoint still shows **1** active `gst_certificate` (old one soft-deleted, only new one visible)

**Step 4 — Upload with invalid document type**

Send with `"documentType": "passport"`.

- [ ] Response is `400 Bad Request`

**Step 5 — File too large**

Send with `"fileSizeBytes": 20000000` (20 MB, over the 10 MB limit).

- [ ] Response is `400 Bad Request` with size validation error

---

### 1.4 Admin KYC Review — Listing

> Requires admin JWT.

```
GET {BASE_URL}/api/admin/dealers/applications
Authorization: Bearer <admin_token>
```

- [ ] Response is `200 OK` with a paginated list
- [ ] `Test Gifts Pvt Ltd` appears in the list with `kycStatus: "under_review"`
- [ ] Filter by status works: `?kycStatus=under_review` returns only under_review applications
- [ ] Search works: `?search=Test Gifts` returns the application
- [ ] Pagination works: `?page=1&pageSize=5`

---

### 1.5 Admin KYC Review — Application Detail

```
GET {BASE_URL}/api/admin/dealers/applications/{PROFILE_UUID}
Authorization: Bearer <admin_token>
```

- [ ] Response is `200 OK`
- [ ] `gstin` is visible in the response (decrypted for admin)
- [ ] `pan` is visible (decrypted for admin)
- [ ] `documents` array contains the uploaded documents

---

### 1.6 Admin Reject Application

```
POST {BASE_URL}/api/admin/dealers/applications/{PROFILE_UUID}/reject
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "reason": "Uploaded documents are blurry — please resubmit clearer copies."
}
```

- [ ] Response is `200 OK` with `{ ok: true }`
- [ ] `GET /api/dealer/onboarding/status` now shows `kycStatus: "rejected"`
- [ ] `rejectionReason` is set to the reason provided
- [ ] Rejecting an already-rejected dealer returns `400 Bad Request`
- [ ] Empty `reason` returns `400 Bad Request`

**Test — Reject with empty reason**

```json
{ "reason": "" }
```

- [ ] Returns `400 Bad Request`

---

### 1.7 Dealer Resubmission After Rejection

```
POST {BASE_URL}/api/dealer/onboarding/resubmit
Authorization: Bearer <dealer_token>
Content-Type: application/json

{
  "businessName": "Test Gifts Pvt Ltd (Updated)",
  "city": "Pune"
}
```

- [ ] Response is `200 OK` with `{ ok: true }`
- [ ] `GET /api/dealer/onboarding/status` shows `kycStatus: "under_review"` again
- [ ] `businessName` and `city` are updated; other fields unchanged
- [ ] Resubmit when status is `under_review` returns `400 Bad Request` ("Only rejected applications can be resubmitted")

---

### 1.8 Admin Approve Application

> Re-approve the resubmitted application.

```
POST {BASE_URL}/api/admin/dealers/applications/{PROFILE_UUID}/approve
Authorization: Bearer <admin_token>
```

- [ ] Response is `200 OK` with `{ ok: true }`
- [ ] `GET /api/admin/dealers/applications/{PROFILE_UUID}` shows `kycStatus: "approved"`
- [ ] `approvedAt` is set to a recent timestamp
- [ ] Approving an already-approved dealer returns `400 Bad Request`
- [ ] Approving a `pending_verification` application returns `400 Bad Request` ("Only applications under review can be approved")
- [ ] The dealer's OM organization is now **active** (check via admin `directory/organizations` if accessible)

Save the `PROFILE_UUID` — you will need it throughout all remaining sections.

---

## Section 2 — FEAT-009: Dealer Org & RBAC

### 2.1 Admin — List & View Approved Dealers

```
GET {BASE_URL}/api/admin/dealers
Authorization: Bearer <admin_token>
```

- [ ] `Test Gifts Pvt Ltd` appears in the list
- [ ] `kycStatus` is `approved`
- [ ] `capabilities` field is present (empty defaults if not yet set)

```
GET {BASE_URL}/api/admin/dealers/{PROFILE_UUID}
Authorization: Bearer <admin_token>
```

- [ ] Returns full dealer detail with capabilities
- [ ] An under_review dealer's UUID here returns `404 Not Found`

---

### 2.2 Admin — Set Dealer Capabilities

```
PUT {BASE_URL}/api/admin/dealers/{PROFILE_UUID}/capabilities
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "productTypeCodes": ["mug", "tshirt", "photo_frame"],
  "printingMethods": ["sublimation", "dtg"],
  "maxDailyCapacity": 500,
  "serviceableStates": ["IN-MH", "IN-KA", "IN-DL"],
  "minOrderQty": 5
}
```

- [ ] Response is `200 OK`
- [ ] `GET /api/admin/dealers/{PROFILE_UUID}` now reflects updated capabilities
- [ ] Invalid printing method (e.g. `"screen_print"`) returns `400 Bad Request`
- [ ] Invalid state code (e.g. `"MH"` instead of `"IN-MH"`) returns `400 Bad Request`
- [ ] `maxDailyCapacity: -1` returns `400 Bad Request`
- [ ] Setting capabilities on an unapproved dealer (use a `under_review` profile UUID) returns `400 Bad Request`

---

### 2.3 Dealer Owner — View Own Profile & Capabilities

```
GET {BASE_URL}/api/dealer/profile
Authorization: Bearer <dealer_owner_token>
```

- [ ] Response is `200 OK`
- [ ] Shows dealer profile merged with capabilities
- [ ] Capabilities reflect what admin set in 2.2

---

### 2.4 Dealer Owner — Update Own Capabilities

```
PUT {BASE_URL}/api/dealer/profile/capabilities
Authorization: Bearer <dealer_owner_token>
Content-Type: application/json

{
  "productTypeCodes": ["mug"],
  "printingMethods": ["sublimation"],
  "maxDailyCapacity": 100,
  "serviceableStates": ["IN-MH"],
  "minOrderQty": 10
}
```

- [ ] Response is `200 OK` with updated capabilities
- [ ] Dealer staff token (not owner) gets `403 Forbidden`

---

### 2.5 Dealer Owner — Invite Staff Member

```
POST {BASE_URL}/api/dealer/staff/invite
Authorization: Bearer <dealer_owner_token>
Content-Type: application/json

{
  "email": "staff@testgifts.in",
  "name": "Rahul Sharma"
}
```

- [ ] Response is `201 Created` with `{ userId: "<uuid>", email: "staff@testgifts.in" }`
- [ ] Invite email arrives at `staff@testgifts.in`
- [ ] Invalid email format returns `400 Bad Request`
- [ ] Dealer staff token gets `403 Forbidden` (only owner can invite)

---

## Section 3 — FEAT-011: Manual Order Assignment

> You need a **paid order** in the system. Note its UUID as `ORDER_UUID`.

### 3.1 Check Initial Assignment State

```
GET {BASE_URL}/api/admin/orders/{ORDER_UUID}/assignment
Authorization: Bearer <admin_token>
```

- [ ] Response is `200 OK` with `{ assignment: null }` (not yet assigned)

---

### 3.2 Assign Order to Dealer

```
POST {BASE_URL}/api/admin/orders/{ORDER_UUID}/assignment
Authorization: Bearer <admin_token>
Idempotency-Key: test-assign-001
Content-Type: application/json

{
  "dealerProfileId": "{PROFILE_UUID}",
  "requiredBy": "2026-12-01T00:00:00.000Z",
  "note": "Urgent — festival season order"
}
```

- [ ] Response is `201 Created` with `{ id: "<assignment_uuid>" }` — save as `ASSIGNMENT_UUID`
- [ ] **Missing `Idempotency-Key` header** returns `400 Bad Request`
- [ ] **Same `Idempotency-Key`** sent again returns the same `{ id }` (idempotent — not a second assignment)
- [ ] Assigning an **unpaid** order returns `400 Bad Request`
- [ ] Dealer assignment email is received at `dealer@testgifts.in`

---

### 3.3 Verify Assignment Was Created

```
GET {BASE_URL}/api/admin/orders/{ORDER_UUID}/assignment
Authorization: Bearer <admin_token>
```

- [ ] Returns assignment with `status: "assigned"`
- [ ] `dealerProfileId` matches `PROFILE_UUID`
- [ ] `requiredBy` date is set correctly

---

### 3.4 View Assignments for a Dealer (Admin)

```
GET {BASE_URL}/api/admin/dealers/{PROFILE_UUID}/orders
Authorization: Bearer <admin_token>
```

- [ ] Returns list containing the new assignment
- [ ] Filter `?status=assigned` works

---

### 3.5 Dealer Updates Production Status

> Use dealer owner token.

**Step 1 — Dealer views own orders**

```
GET {BASE_URL}/api/dealer/orders?dealerProfileId={PROFILE_UUID}
Authorization: Bearer <dealer_owner_token>
```

- [ ] Assignment appears in list with `status: "assigned"`

**Step 2 — Acknowledge the order**

```
POST {BASE_URL}/api/dealer/orders/{ASSIGNMENT_UUID}/status
Authorization: Bearer <dealer_owner_token>
Content-Type: application/json

{
  "status": "acknowledged",
  "note": "We will start production tomorrow."
}
```

- [ ] Response is `200 OK`
- [ ] `GET /api/dealer/orders/{ASSIGNMENT_UUID}` shows `status: "acknowledged"`

**Step 3 — Move through the full production flow**

Repeat the status update POST for each stage:

| Status | Notes |
|--------|-------|
| `in_production` | Optionally include a note |
| `ready_for_dispatch` | No note required |
| `dispatched` | Include courier details in note |

- [ ] `in_production` update succeeds
- [ ] `ready_for_dispatch` update succeeds
- [ ] `dispatched` update succeeds
- [ ] `GET /api/admin/orders/{ORDER_UUID}/assignment` shows `status: "dispatched"`
- [ ] Dealer cannot set an **invalid status** (e.g. `"approved"`) — returns `400 Bad Request`
- [ ] Dealer cannot view another dealer's assignment by guessing a UUID — returns `404 Not Found`

---

### 3.6 Reassign Order to a Different Dealer

> Create a second dealer (repeat Section 1 steps 1.1–1.8 with a new email) and note as `PROFILE_UUID_2`.

```
PUT {BASE_URL}/api/admin/orders/{ORDER_UUID}/assignment
Authorization: Bearer <admin_token>
Idempotency-Key: test-reassign-001
Content-Type: application/json

{
  "dealerProfileId": "{PROFILE_UUID_2}",
  "requiredBy": "2026-12-05T00:00:00.000Z",
  "reason": "Capacity issue with first dealer"
}
```

- [ ] Response is `200 OK` with `{ id: "<new_assignment_uuid>" }`
- [ ] `GET /api/admin/orders/{ORDER_UUID}/assignment` now shows the new dealer
- [ ] Prior assignment is cancelled (check via dealer 1's order list)

---

### 3.7 Cancel Assignment

Use the assignment on a fresh order (or re-assign first).

```
DELETE {BASE_URL}/api/admin/orders/{ORDER_UUID}/assignment
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "reason": "Order cancelled by customer"
}
```

- [ ] Response is `200 OK` with `{ ok: true }`
- [ ] `GET /api/admin/orders/{ORDER_UUID}/assignment` returns `{ assignment: null }`

---

## Section 4 — FEAT-012: Commission Engine

> Commission snapshots are created **automatically** when an order is assigned. Ensure you have at least one completed assignment from Section 3.

### 4.1 Create Commission Rules (Admin)

**Step 1 — Platform-wide default rule**

```
POST {BASE_URL}/api/admin/commission/rules
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "dealerProfileId": null,
  "productTypeCode": null,
  "rateBps": 1500
}
```

- [ ] Response is `201 Created` with `{ id: "<rule_uuid>" }` — save as `DEFAULT_RULE_UUID`
- [ ] `GET /api/admin/commission/rules` lists the new rule

**Step 2 — Dealer-specific rule (overrides platform default)**

```
POST {BASE_URL}/api/admin/commission/rules
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "dealerProfileId": "{PROFILE_UUID}",
  "productTypeCode": null,
  "rateBps": 1800
}
```

- [ ] Response is `201 Created`

**Step 3 — Product-type-specific rule for this dealer (highest priority)**

```
POST {BASE_URL}/api/admin/commission/rules
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "dealerProfileId": "{PROFILE_UUID}",
  "productTypeCode": "mug",
  "rateBps": 2000
}
```

- [ ] Response is `201 Created`

---

### 4.2 List Commission Rules

```
GET {BASE_URL}/api/admin/commission/rules
Authorization: Bearer <admin_token>
```

- [ ] All 3 rules appear in the list
- [ ] Filter `?dealerProfileId={PROFILE_UUID}` returns only dealer-specific rules (2 rules)
- [ ] Filter `?activeOnly=true` returns only active rules

---

### 4.3 View Commission Snapshot for an Assigned Order

> Assign a new order (Section 3.2) **after** creating the rules above so the snapshot picks up the correct rate.

```
GET {BASE_URL}/api/admin/orders/{ORDER_UUID}/commission
Authorization: Bearer <admin_token>
```

- [ ] Response is `200 OK` with snapshot data
- [ ] `rateBps` reflects the correct rule priority (product-type rule if matched, dealer rule otherwise, platform default as fallback)
- [ ] `commissionAmount` is an integer (INR paise)
- [ ] An unassigned order returns `404 Not Found`

---

### 4.4 View Commission History for a Dealer (Admin)

```
GET {BASE_URL}/api/admin/dealers/{PROFILE_UUID}/commission
Authorization: Bearer <admin_token>
```

- [ ] Returns list of commission snapshots for this dealer
- [ ] Each entry shows `orderId`, `assignmentId`, `rateBps`, `commissionAmount`

---

### 4.5 Dealer Views Own Earnings

```
GET {BASE_URL}/api/dealer/earnings?dealerProfileId={PROFILE_UUID}
Authorization: Bearer <dealer_owner_token>
```

- [ ] Returns list of commission snapshots visible to this dealer
- [ ] Dealer staff token also works (earnings are view-only)
- [ ] Dealer cannot see another dealer's earnings (try a different `dealerProfileId`)

```
GET {BASE_URL}/api/dealer/earnings/{ASSIGNMENT_UUID}
Authorization: Bearer <dealer_owner_token>
```

- [ ] Returns single commission snapshot for that assignment

---

### 4.6 Deactivate a Commission Rule

```
DELETE {BASE_URL}/api/admin/commission/rules/{DEFAULT_RULE_UUID}
Authorization: Bearer <admin_token>
```

- [ ] Response is `200 OK` with `{ ok: true }`
- [ ] `GET /api/admin/commission/rules?activeOnly=true` no longer returns this rule
- [ ] `GET /api/admin/commission/rules/{DEFAULT_RULE_UUID}` shows `effectiveTo` is set (soft deactivation, not deleted)

---

## Section 5 — FEAT-013: Payout Ledger

> Ledger entries are auto-created when a commission snapshot is saved. At least one snapshot must exist from Section 4.

### 5.1 View Dealer Ledger (Admin)

```
GET {BASE_URL}/api/admin/dealers/{PROFILE_UUID}/ledger
Authorization: Bearer <admin_token>
```

- [ ] Returns paged list of ledger entries
- [ ] At least one `commission_earned` entry with `direction: "credit"`
- [ ] Filter `?entryType=commission_earned` works
- [ ] Filter `?direction=credit` works

---

### 5.2 View Dealer Balance (Admin)

```
GET {BASE_URL}/api/admin/dealers/{PROFILE_UUID}/ledger/balance
Authorization: Bearer <admin_token>
```

- [ ] Returns `{ dealerProfileId, pendingAmount, totalEarned, currencyCode: "INR" }`
- [ ] `totalEarned` matches the sum of commission credits in the ledger
- [ ] `pendingAmount` equals `totalEarned` (no payouts yet)
- [ ] All amounts are integers (INR paise)

---

### 5.3 Record a Manual Payout

```
POST {BASE_URL}/api/admin/dealers/{PROFILE_UUID}/ledger/payout
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "amount": 50000,
  "note": "UTR: HDFC123456789"
}
```

> `50000` paise = ₹500

- [ ] Response is `201 Created` with `{ id: "<ledger_entry_uuid>" }`
- [ ] `GET /api/admin/dealers/{PROFILE_UUID}/ledger` now has a `payout_disbursed` debit entry
- [ ] `GET /api/admin/dealers/{PROFILE_UUID}/ledger/balance` — `pendingAmount` decreased by ₹500
- [ ] `totalEarned` is **unchanged** (payout reduces pending, not earnings)
- [ ] `amount: 0` returns `400 Bad Request`
- [ ] `amount: -1` returns `400 Bad Request`
- [ ] Missing `note` returns `400 Bad Request`

---

### 5.4 Record a Manual Adjustment

**Credit adjustment:**

```
POST {BASE_URL}/api/admin/dealers/{PROFILE_UUID}/ledger/adjustment
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "direction": "credit",
  "amount": 10000,
  "note": "Goodwill bonus — Q3 performance"
}
```

- [ ] Response is `201 Created`
- [ ] Ledger shows `adjustment_credit` entry
- [ ] Balance `pendingAmount` increased by ₹100

**Debit adjustment:**

```
POST {BASE_URL}/api/admin/dealers/{PROFILE_UUID}/ledger/adjustment
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "direction": "debit",
  "amount": 5000,
  "note": "Penalty — delayed dispatch on order #XYZ"
}
```

- [ ] Response is `201 Created`
- [ ] Ledger shows `adjustment_debit` entry
- [ ] Balance `pendingAmount` decreased by ₹50

**Validation:**

- [ ] Missing `note` returns `400 Bad Request`
- [ ] Invalid `direction` (e.g. `"neutral"`) returns `400 Bad Request`

---

### 5.5 Dealer Views Own Ledger & Balance

```
GET {BASE_URL}/api/dealer/ledger?dealerProfileId={PROFILE_UUID}
Authorization: Bearer <dealer_owner_token>
```

- [ ] Returns same entries as admin view
- [ ] Payout and adjustment entries are visible

```
GET {BASE_URL}/api/dealer/ledger/balance?dealerProfileId={PROFILE_UUID}
Authorization: Bearer <dealer_owner_token>
```

- [ ] Returns `{ pendingAmount, totalEarned, currencyCode: "INR" }`
- [ ] Amounts match admin view exactly

**Access control:**

- [ ] Dealer cannot view another dealer's ledger (use a different `dealerProfileId` — returns `403` or `404`)
- [ ] Dealer staff token can also view ledger (read-only access)

---

## Section 6 — End-to-End Happy Path

Run the complete flow once without interruption to verify all pieces connect.

- [ ] **Register** a fresh dealer via `POST /api/dealer/onboarding/register`
- [ ] **Upload** two KYC documents — confirm status auto-advances to `under_review`
- [ ] **Approve** the dealer via `POST /api/admin/dealers/applications/:id/approve`
- [ ] **Set capabilities** via `PUT /api/admin/dealers/:id/capabilities`
- [ ] **Invite staff** via `POST /api/dealer/staff/invite` — confirm email arrives
- [ ] **Create commission rule** for this dealer via `POST /api/admin/commission/rules`
- [ ] **Assign a paid order** to the dealer via `POST /api/admin/orders/:id/assignment` (include `Idempotency-Key`)
- [ ] **Confirm commission snapshot** auto-created: `GET /api/admin/orders/:id/commission`
- [ ] **Confirm ledger credit** auto-created: `GET /api/admin/dealers/:id/ledger`
- [ ] **Dealer acknowledges** the order: `POST /api/dealer/orders/:id/status` → `acknowledged`
- [ ] **Dealer dispatches**: advance status through `in_production` → `ready_for_dispatch` → `dispatched`
- [ ] **Record payout** via `POST /api/admin/dealers/:id/ledger/payout`
- [ ] **Confirm balance** reduced: `GET /api/admin/dealers/:id/ledger/balance`
- [ ] **Dealer views final balance** via `GET /api/dealer/ledger/balance` — matches admin view

---

## Section 7 — Security & Edge Case Checks

### Auth & Scope

- [ ] All admin routes return `401 Unauthorized` when called without a token
- [ ] Dealer token calling an admin route (e.g. `GET /api/admin/dealers/applications`) returns `403 Forbidden`
- [ ] Admin token calling `GET /api/dealer/profile` returns `403 Forbidden` (wrong role)
- [ ] Dealer staff token calling `POST /api/dealer/staff/invite` returns `403 Forbidden` (owner-only)
- [ ] Dealer cannot access another dealer's profile by guessing their `PROFILE_UUID`

### Data Integrity

- [ ] GSTIN and PAN never appear in `GET /api/dealer/onboarding/status` response (encrypted at rest, hidden from dealer)
- [ ] `tenantId` never appears in any dealer-facing response body
- [ ] Ledger entries cannot be modified — there is no `PUT /api/admin/dealers/:id/ledger/:entryId` endpoint
- [ ] Commission snapshot cannot be modified — there is no `PUT /api/admin/orders/:id/commission` endpoint
- [ ] Attempting to `DELETE` a commission snapshot returns `404 Method Not Allowed`

### Monetary Precision

- [ ] Commission `rateBps: 1500` on an order worth ₹1000 (`100000` paise) creates a `commissionAmount` of `15000` paise (₹150) — verify the arithmetic
- [ ] A payout `amount` of `1` paise is accepted (no minimum enforced beyond > 0)
- [ ] A payout `amount` of `1.5` (float) returns `400 Bad Request` (must be integer)

### Idempotency

- [ ] `POST /api/admin/orders/:id/assignment` with the same `Idempotency-Key` sent twice returns the same `{ id }` and does NOT create a second assignment
- [ ] `POST /api/admin/orders/:id/assignment` with a **different** `Idempotency-Key` creates a new assignment (first one auto-cancelled as a reassignment)
- [ ] Missing `Idempotency-Key` on assignment POST returns `400 Bad Request`

---

## Notes

| Symbol | Meaning |
|--------|---------|
| `PROFILE_UUID` | UUID of the dealer profile created in Section 1 |
| `ORDER_UUID` | UUID of a paid order for testing assignment |
| `ASSIGNMENT_UUID` | UUID of the assignment created in Section 3 |
| `DEFAULT_RULE_UUID` | UUID of the platform-wide commission rule |

**Commission rate priority (highest → lowest):**  
Product-type-specific for dealer → Dealer-level default → Platform-wide default → 0 (with warning in logs)

**Status flows:**

```
KYC:        pending_verification → under_review → approved
                                              └→ rejected → (resubmit) → under_review
Assignment: assigned → acknowledged → in_production → ready_for_dispatch → dispatched
                                                                         └→ cancelled
Ledger:     append-only — never update or delete, only add new entries
```
