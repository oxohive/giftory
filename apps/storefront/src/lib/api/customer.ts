import { z } from 'zod'
import { bffRequest } from './http'

/**
 * Customer accounts (shopper auth + profile). Called from the browser through the BFF proxy,
 * which forwards/relays the backend's httpOnly cookies (`customer_auth_token` JWT, 8h, and
 * `customer_session_token`, 30d) and injects tenant/organization ids into login/signup bodies.
 *
 * Source: node_modules/@open-mercato/core/dist/modules/customer_accounts/api/
 *   POST /api/customer_accounts/login                 login.js
 *   POST /api/customer_accounts/signup                signup.js (always 202; email verification required before login)
 *   POST /api/customer_accounts/email/verify          email/verify.js
 *   POST /api/customer_accounts/password/reset-request
 *   POST /api/customer_accounts/password/reset-confirm
 *   GET  /api/customer_accounts/portal/profile        portal/profile.js
 *   PUT  /api/customer_accounts/portal/profile        portal/profile.js (requires feature portal.account.manage)
 *   POST /api/customer_accounts/portal/password-change
 *   POST /api/customer_accounts/portal/logout
 *   POST /api/customer_accounts/portal/sessions-refresh (used by the proxy automatically)
 */

export const customerUserSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
    emailVerified: z.boolean().optional(),
    customerEntityId: z.string().nullable().optional(),
    personEntityId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    lastLoginAt: z.string().nullable().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough()

export type CustomerUser = z.infer<typeof customerUserSchema>

const loginResponseSchema = z
  .object({ ok: z.literal(true), user: customerUserSchema, resolvedFeatures: z.array(z.string()).optional() })
  .passthrough()

const okSchema = z.object({ ok: z.literal(true) }).passthrough()

export const profileResponseSchema = z
  .object({
    ok: z.literal(true),
    user: customerUserSchema,
    roles: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() }).passthrough()).optional(),
    resolvedFeatures: z.array(z.string()).optional(),
    isPortalAdmin: z.boolean().optional(),
  })
  .passthrough()

export type CustomerProfile = z.infer<typeof profileResponseSchema>

/* Form schemas mirror the backend validators (customer_accounts/data/validators.js). */
export const loginFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(255),
  password: z.string().min(1, 'Enter your password').max(128),
})
export type LoginForm = z.infer<typeof loginFormSchema>

export const registerFormSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Tell us your name').max(255),
    email: z.string().trim().email('Enter a valid email address').max(255),
    password: z.string().min(8, 'Use at least 8 characters').max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' })
export type RegisterForm = z.infer<typeof registerFormSchema>

export const profileFormSchema = z.object({
  displayName: z.string().trim().min(1, 'Name is required').max(255),
})
export type ProfileForm = z.infer<typeof profileFormSchema>

export const customerApi = {
  login: (input: LoginForm) =>
    bffRequest('customer_accounts/login', loginResponseSchema, { method: 'POST', body: input }),

  register: (input: Omit<RegisterForm, 'confirmPassword'>) =>
    bffRequest('customer_accounts/signup', okSchema, { method: 'POST', body: input }),

  verifyEmail: (token: string) =>
    bffRequest('customer_accounts/email/verify', okSchema, { method: 'POST', body: { token } }),

  requestPasswordReset: (email: string) =>
    bffRequest('customer_accounts/password/reset-request', okSchema, { method: 'POST', body: { email } }),

  profile: () => bffRequest('customer_accounts/portal/profile', profileResponseSchema),

  updateProfile: (input: ProfileForm) =>
    bffRequest(
      'customer_accounts/portal/profile',
      z.object({ ok: z.literal(true), user: customerUserSchema }).passthrough(),
      { method: 'PUT', body: input },
    ),

  logout: () => bffRequest('customer_accounts/portal/logout', okSchema, { method: 'POST' }),
}
