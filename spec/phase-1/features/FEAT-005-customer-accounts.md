# Feature: Customer Accounts & Address Book

- **Feature ID:** FEAT-005
- **Phase:** 1
- **Status:** Implemented
- **Objective:** Allow shoppers to register, verify their email, log in, manage their profile and address book, and have their cart persist across sessions.
- **Business Value:** Accounts enable order history, saved addresses, faster checkout, and guest cart recovery on return visits.
- **Scope:** Registration, email verification (manual in dev), login, profile, password change, logout, session refresh, address CRUD, guest cart merge on login.
- **Out of Scope:** Social login, MFA (planned in later phases), magic link (API exists, storefront UI not verified).

## Current Behavior

**Verified** from BFF proxy allowlist (`apps/storefront/src/app/api/om/[...path]/route.ts`) and `apps/storefront/docs/backend-api-contract.md`.

### Auth Flow

1. Shopper registers at `/account/register` via `POST /api/customer_accounts/signup`.
2. Verification email is sent by the backend. In development (no email provider), the admin verifies manually under **Customer accounts**.
3. Shopper logs in at `/account/login` via `POST /api/customer_accounts/login`. Backend sets two httpOnly cookies: `customer_auth_token` (JWT, 8h) and `customer_session_token` (30d).
4. The BFF proxy (`/api/om/*`) transparently refreshes an expired `customer_auth_token` using the session token.
5. Logout: `POST /api/customer_accounts/portal/logout` clears both cookies.

### Known Issue: Email Link Redirect

Account emails (verification, password reset) contain links that point to the Open Mercato built-in portal, not the storefront's `/account/verify` route. Fixed in code (redirects + pages added); requires `PLATFORM_PORTAL_BASE_URL` set in `apps/mercato/.env` in production. See [US-004](../stories/US-004-email-verification-links.md).

### Tenant Injection

On platform domains, the BFF injects `organizationId` and `tenantId` from server-side env vars (`MERCATO_ORGANIZATION_ID`, `MERCATO_TENANT_ID`) into login/signup request bodies.

### Address Book

`GET/POST /api/storefront/account/addresses` — list and create addresses (requires customer session).
`GET/PUT/DELETE /api/storefront/account/addresses/{id}` — single address operations.

Table: `storefront_addresses`

| Field | Notes |
|---|---|
| `full_name`, `phone` | Contact for delivery |
| `line1`, `line2`, `city`, `state`, `postal_code` | Indian address fields |
| `country` | Default `IN` |
| `is_default` | One default address per customer |

### Customer Link

Table: `storefront_customer_links` — links the `customer_accounts` user (`customer_user_id`) to the CRM person entity (`person_entity_id`), enabling customer order history in the admin.

## API Endpoints (via BFF proxy)

| Method | Path | Description |
|---|---|---|
| `POST` | `customer_accounts/signup` | Register |
| `POST` | `customer_accounts/login` | Login |
| `POST` | `customer_accounts/email/verify` | Verify email with token |
| `POST` | `customer_accounts/password/reset-request` | Request password reset |
| `POST` | `customer_accounts/password/reset-confirm` | Confirm password reset |
| `GET/PUT` | `customer_accounts/portal/profile` | View/update profile |
| `POST` | `customer_accounts/portal/logout` | Logout |
| `POST` | `customer_accounts/portal/password-change` | Change password |
| `POST` | `customer_accounts/portal/sessions-refresh` | Refresh auth token |

## Requirements

1. Registration must create an account requiring email verification.
2. Login must set `customer_auth_token` and `customer_session_token` httpOnly cookies.
3. An expired auth token must be refreshed transparently without requiring re-login.
4. On login, a guest cart must merge into the customer's cart.
5. Address book must support add, edit, delete, and set-as-default.
6. Logout must clear both session cookies.
7. Email verification and password reset links in emails must point to the storefront (requires `PLATFORM_PORTAL_BASE_URL` in production).

## Dependencies

- Open Mercato `customer_accounts` module
- `storefront` module — cart adoption, `storefront_addresses`, `storefront_customer_links`
- BFF proxy — cookie forwarding and tenant injection

## Related User Stories

- [US-004](../stories/US-004-email-verification-links.md) — Fix email verification redirect (Gap G7)

## Evidence

- `apps/storefront/src/app/account/` — registration, login, verify, addresses, orders pages
- `apps/storefront/src/app/api/om/[...path]/route.ts` — BFF proxy with allowlist and tenant injection
- `apps/mercato/src/modules/storefront/data/entities.ts` — address and customer link entities
- `apps/storefront/docs/backend-api-contract.md` §Customer Accounts, §Gap G7
- `apps/storefront/__integration__/storefront-and-admin.spec.ts` — Customer accounts section

## Known Limitations

- No email provider configured in development; verification must be done manually in the admin.
- Magic link authentication: API routes exist and are proxied, but storefront UI is not verified.
