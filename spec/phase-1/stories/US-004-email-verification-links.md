# US-004: Fix Email Verification and Password Reset Links (Gap G7)

- **Phase:** 1
- **Status:** Done (env var required in production)
- **Priority:** High
- **Parent Features:** [FEAT-005](../features/FEAT-005-customer-accounts.md)

## User Story

As a new shopper,
I want the verification link in my registration email to open the storefront's verification page,
so that I can complete my registration without being redirected to an unfamiliar system portal.

## Context

When a shopper registers or requests a password reset, the Open Mercato backend sends a transactional email containing a link. That link was pointing to the Open Mercato built-in portal, not the storefront's `/account/verify` or `/account/reset-password` routes. This is Gap G7 in `apps/storefront/docs/backend-api-contract.md`.

## Acceptance Criteria

1. Given a shopper registers at `/account/register`, when the verification email arrives, then clicking the link opens the storefront's `/account/verify?token=<token>` page.
2. Given a shopper requests a password reset, when the reset email arrives, then clicking the link opens the storefront's `/account/reset-password?token=<token>` page.
3. The storefront pages at those routes handle the token, call the backend to complete verification/reset, and show success or error feedback.

## Implementation Notes

Open Mercato builds email links as `{PLATFORM_PORTAL_BASE_URL}/{orgSlug}/portal/verify?token=...`.

### What was implemented

1. **`apps/storefront/next.config.ts`** — Added `redirects()` that catch `/:orgSlug/portal/verify` and `/:orgSlug/portal/reset-password` and forward them (with query string) to `/account/verify` and `/account/reset-password`.

2. **`/account/verify`** — Already existed; accepts `?token=` and calls `POST /api/customer_accounts/email/verify`.

3. **`/account/reset-password`** — Created (`apps/storefront/src/app/account/reset-password/page.tsx`). Accepts `?token=` and renders `ResetPasswordForm`.

4. **`apps/storefront/src/components/account/reset-password-form.tsx`** — Created; form with new-password + confirm-password fields, success/error states.

5. **`apps/storefront/src/lib/api/customer.ts`** — Added `confirmPasswordReset(token, newPassword)`.

### Required production config

Set in `apps/mercato/.env`:
```
PLATFORM_PORTAL_BASE_URL=https://<storefront-domain>
```

Without this, emails still link to `http://localhost:3000/{orgSlug}/portal/verify` in dev. In development, verify manually through the admin console until an email provider is configured.
