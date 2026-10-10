---
id: TASK-01
title: Expo app scaffold + navigation shell
status: Done (sandbox-verified — see spec/mobile/IMPLEMENTATION-NOTES.md)
---

# TASK-01 — Expo app scaffold + navigation shell

## Objective

Create a new standalone Expo (TypeScript) app at `apps/mobile`, with a working navigation shell (bottom tabs + nested stacks) and placeholder screens at every route other tasks will later fill in. This is the one task every other task implicitly builds on, so it must land first — but it is pure boilerplate + stubs, so it is fast and carries no business logic.

**Do not touch** `apps/mercato`, `apps/storefront`, or any root-level file (`/.env`, `/README.md`, `/CLAUDE.md`). This app is 100% standalone — no monorepo workspace exists in this repo (confirmed: no root `package.json`/`yarn.lock`), so do not create one.

## Boundaries

**You own and may create/edit:**
- `apps/mobile/package.json`
- `apps/mobile/app.json` (or `app.config.ts` if you prefer typed config — pick one and note it in your PR/commit)
- `apps/mobile/tsconfig.json`
- `apps/mobile/babel.config.js`
- `apps/mobile/App.tsx` (or `apps/mobile/app/_layout.tsx` if using Expo Router — **do not use Expo Router**; use `@react-navigation/native` + `@react-navigation/native-stack` + `@react-navigation/bottom-tabs` so the route-param types below are explicit and typed, not file-system-inferred)
- `apps/mobile/src/navigation/**` (the navigator components themselves — NOT the final wiring of real screens, that is TASK-09's job; here you wire placeholder screens)
- `apps/mobile/.env.example`
- The **placeholder screen files** listed below (exact paths — other tasks overwrite these files later; you create them once as simple stubs that render a `<Text>` with the screen name, so the app boots and every route is reachable before any feature task lands)

**Do not touch after this task is merged:** the placeholder screen file contents (feature tasks own them from here). You also do not touch `src/theme/**`, `src/components/ui/**`, or `src/lib/api/**` — those belong to TASK-02/03/04.

## Placeholder screens to create (exact paths)

```
src/features/catalog/screens/HomeScreen.tsx
src/features/catalog/screens/ProductListScreen.tsx
src/features/catalog/screens/ProductDetailScreen.tsx
src/features/cart/screens/CartScreen.tsx
src/features/checkout/screens/AddressScreen.tsx
src/features/checkout/screens/ShippingScreen.tsx
src/features/checkout/screens/PaymentScreen.tsx
src/features/checkout/screens/ConfirmationScreen.tsx
src/features/account/screens/AccountScreen.tsx
src/features/account/screens/AddressesScreen.tsx
src/features/orders/screens/OrderDetailScreen.tsx
```

Each stub:
```tsx
import { Text, View } from 'react-native'
export default function HomeScreen() {
  return <View><Text>TODO: HomeScreen</Text></View>
}
```
(substitute the matching name)

## Contracts produced (other tasks depend on these exact names/shapes)

`src/navigation/types.ts`:
```ts
export type RootTabParamList = {
  Home: undefined
  Products: { occasion?: string; category?: string } | undefined
  Cart: undefined
  Account: undefined
}

export type CatalogStackParamList = {
  Home: undefined
  ProductList: { occasion?: string; category?: string; search?: string } | undefined
  ProductDetail: { handle: string }
}

export type CheckoutStackParamList = {
  Address: undefined
  Shipping: undefined
  Payment: undefined
  Confirmation: { orderId: string }
}

export type AccountStackParamList = {
  Account: undefined
  Addresses: undefined
  OrderDetail: { orderId: string }
}
```

`src/lib/config.ts` (env loader — you create the file and the env var names only; TASK-03's `env.ts` is the typed consumer that reads from this):
```ts
// Populated from EXPO_PUBLIC_* vars via app.json "extra" or process.env (Expo inlines EXPO_PUBLIC_* at build time)
export const rawConfig = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  organizationId: process.env.EXPO_PUBLIC_ORG_ID,
  orgSlug: process.env.EXPO_PUBLIC_ORG_SLUG,
  razorpayKeyId: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID,
}
```

`.env.example`:
```
# Backend base URL. On a physical device/simulator, "localhost" refers to the
# device itself, not your dev machine — use your machine's LAN IP instead,
# e.g. http://192.168.1.50:3000. Confirmed dev value from the repo root .env:
# APP_URL=http://localhost:3000
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

# The backend resolves tenant/org scope via (1) custom domain, (2) signed-in
# session, (3) this query param — mobile has no custom domain, so one of
# these two must be set. Pull the actual value from apps/storefront/.env
# (not committed) or re-seed via `yarn mercato gift_catalog seed-demo`.
EXPO_PUBLIC_ORG_ID=
EXPO_PUBLIC_ORG_SLUG=

# Razorpay publishable Key ID ONLY. NEVER put the Key Secret here or
# anywhere in this app — the secret is backend-only, used for signature
# verification in apps/mercato/.env.
EXPO_PUBLIC_RAZORPAY_KEY_ID=
```

## Backend endpoints used

None directly — this task has no network calls.

## Acceptance criteria

- `cd apps/mobile && npx expo start` boots without errors (or `yarn ios`/`yarn android` if you set those scripts).
- Bottom tabs: Home, Products, Cart, Account — each navigable.
- Tapping a product tile (even a stub) navigates to `ProductDetail` inside the `CatalogStackParamList` nested stack from `Home`/`ProductList`.
- Checkout and Account/Order-detail stacks are reachable via placeholder navigation actions (a button on `CartScreen` stub that pushes `Address`, etc.) — just enough to prove the graph compiles and is typed.
- No TypeScript errors (`npx tsc --noEmit`).

## Dependencies to add

```
expo
react-native
@react-navigation/native
@react-navigation/native-stack
@react-navigation/bottom-tabs
react-native-safe-area-context
react-native-screens
typescript
@types/react
```
(You install these directly since you own `package.json` in this task. Every other task lists its own additions for TASK-09 to merge later.)

## Non-goals

- No real screen content (feature tasks own that).
- No API client (TASK-03/04).
- No design system components (TASK-02) — stubs may use bare React Native `View`/`Text`.
- No Expo Router.
