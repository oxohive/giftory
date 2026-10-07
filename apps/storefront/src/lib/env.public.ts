/** Public configuration. Safe to import from client components (values are inlined at build). */
export const publicEnv = {
  apiBaseUrl: (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100').replace(/\/+$/, ''),
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
  currency: 'INR',
} as const

/** Path prefix of the storefront's BFF proxy to Open Mercato (see src/app/api/om/[...path]/route.ts). */
export const BFF_PREFIX = '/api/om'
