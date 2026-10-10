# Feature: Dealer Onboarding & KYC

- **Feature ID:** FEAT-008
- **Phase:** 2
- **Status:** Draft
- **Objective:** Allow a dealer (a printing/production business) to self-register on the platform, submit KYC documents, and be approved by an admin before receiving order assignments.
- **Business Value:** Dealers are the fulfillment layer for all customizable gifts. Without verified, approved dealers, no order can be produced.
- **Scope:** Dealer self-registration, KYC document submission, admin review + approval/rejection, dealer profile management.
- **Out of Scope:** Dealer portal UI (FEAT-010), automated matching (Phase 5), capability configuration (FEAT-009).

## Requirements

1. A dealer can register with: business name, contact email, phone, GSTIN (India), business type, city, state, and pincode.
2. Registration creates a pending dealer organization and sends a verification email.
3. A dealer can upload KYC documents: GST certificate, PAN card, business address proof (PDF or image, max 10 MB each).
4. A dealer can view the status of their application: `pending_verification` → `under_review` → `approved` / `rejected`.
5. An admin can review the application, view uploaded documents, and approve or reject it with a reason.
6. On approval, the dealer organization becomes `active` and the dealer receives an email with a link to the dealer portal.
7. On rejection, the dealer receives an email with the rejection reason and may resubmit.
8. A rejected dealer can update their application and resubmit once.

## Data Model

### `dealer_profiles` (app module table)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `organization_id` | `uuid` | FK → OM `organizations` table |
| `tenant_id` | `uuid` | Multi-tenancy scope |
| `business_name` | `text` | |
| `gstin` | `text` | Encrypted; India GST identification |
| `pan` | `text` | Encrypted |
| `business_type` | `text` | `proprietorship`, `partnership`, `pvt_ltd`, `llp` |
| `city` | `text` | |
| `state` | `text` | ISO 3166-2:IN state code |
| `pincode` | `text` | |
| `kyc_status` | `text` | `pending_verification`, `under_review`, `approved`, `rejected` |
| `rejection_reason` | `text` | Nullable |
| `reviewed_by` | `uuid` | FK → OM `users`; nullable |
| `reviewed_at` | `timestamptz` | Nullable |
| `approved_at` | `timestamptz` | Nullable |
| `deleted_at` | `timestamptz` | Soft delete |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### `dealer_kyc_documents` (app module table)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `dealer_profile_id` | `uuid` | FK → `dealer_profiles` |
| `tenant_id` | `uuid` | |
| `document_type` | `text` | `gst_certificate`, `pan_card`, `address_proof` |
| `storage_key` | `text` | Object storage key (private bucket) |
| `file_name` | `text` | Original file name |
| `file_size_bytes` | `int` | |
| `mime_type` | `text` | |
| `uploaded_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` | |

## API Contract

### Dealer-facing (unauthenticated registration + authenticated management)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/dealer/onboarding/register` | Submit registration |
| `GET` | `/api/dealer/onboarding/status` | Get own application status |
| `POST` | `/api/dealer/onboarding/documents` | Upload KYC document |
| `POST` | `/api/dealer/onboarding/resubmit` | Resubmit after rejection |

### Admin-facing

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/dealers/applications` | List pending applications |
| `GET` | `/api/admin/dealers/applications/:id` | Get application detail + document links |
| `POST` | `/api/admin/dealers/applications/:id/approve` | Approve |
| `POST` | `/api/admin/dealers/applications/:id/reject` | Reject with reason |

## Dependencies

- Open Mercato `organizations` module — dealer maps to an OM organization
- Object storage (S3/MinIO) for KYC documents — private bucket, signed URLs
- Email notification (FEAT-008 triggers: verification, approval, rejection)
- [ADR-003](../decisions/ADR-003-dealer-org-model.md) — must be decided before implementation

## Related Stories

- [US-005](../stories/US-005-dealer-marketplace-foundation.md) — AC #1, #2
