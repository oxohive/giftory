# Giftory Mobile (Expo / React Native)

Customer-facing mobile port of Phase 1 (catalog, cart, guest checkout via Razorpay, guest-scoped order history) calling the `apps/mercato` backend directly. Standalone Expo app — no monorepo workspace, no shared packages, zero coupling to `apps/storefront`.

**Status: implemented and verified live on a physical Android device**, via a `cloudflared` tunnel (see below) against the deployed dev backend (`apps/mercato`, same Supabase DB as local dev). Catalog browsing, cart, and navigation have been exercised end-to-end on-device; **Razorpay checkout has not** — the native-SDK field mapping is still an inference from reading the web storefront's code, not a confirmed live payment. See [`spec/mobile/README.md`](../../spec/mobile/README.md) and [`spec/mobile/IMPLEMENTATION-NOTES.md`](../../spec/mobile/IMPLEMENTATION-NOTES.md) for the full build history, every discrepancy found between the spec and the real backend, and the open items below before treating this as production-ready.

## Setup

```bash
cd apps/mobile
npm install
cp .env.example .env
```

Fill in `.env`:

| Var | Value |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Backend origin. Dev default is `http://localhost:3000` — **on a physical device/simulator, use your machine's LAN IP instead** (`localhost` resolves to the device itself, not your dev machine). |
| `EXPO_PUBLIC_ORG_ID` or `EXPO_PUBLIC_ORG_SLUG` | **Required** — the backend resolves storefront tenant/org scope via this query param since mobile has no custom domain. At least one must be set or the app refuses to start. Pull the real value from `apps/storefront/.env` (not committed) or re-seed with `yarn mercato gift_catalog seed-demo`. |
| `EXPO_PUBLIC_RAZORPAY_KEY_ID` | **Required** — Razorpay **publishable Key ID only**. The app refuses to start without it. **Never put the Key Secret here or anywhere in this app** — the secret stays backend-only, in `apps/mercato/.env`, for signature verification. |

## Run

```bash
npm start        # expo start — scan the QR code with Expo Go, or press a/i for a simulator
npm run android
npm run ios
npm run typecheck   # tsc --noEmit
```

No native linking step was run in this build — `react-native-razorpay` needs a native build (`expo prebuild` or EAS Build) to actually work on-device; Expo Go alone won't link it.

### Connecting a physical device when the dev machine isn't on the same LAN

If Metro's dev server runs on a remote machine the phone can't reach directly (e.g. a cloud VM accessed over SSH), `npm start`'s default LAN QR code won't work. Two options, tried in this exact setup on 2026-10-11:

- **`npx expo start --tunnel` (ngrok) — confirmed broken, do not use.** `@expo/ngrok` bundles ngrok v2.3.41, which ngrok's servers now hard-reject (`ERR_NGROK_121`: minimum supported agent is v3.20.0) — no newer `@expo/ngrok-bin-*` package exists on npm to fix this by upgrading. Swapping in a real ngrok v3 binary gets further (the agent connects, the raw tunnel-creation API works correctly when called directly) but `@expo/ngrok`'s own JS client then fails with a reproducible "tunnel already exists" error on a fresh random tunnel ID — an unexplained incompatibility in that library against v3's API responses, not something worth patching blind. This is a dead end until `@expo/ngrok` is updated upstream.
- **`cloudflared` tunnel — confirmed working, with one extra step.** No account/signup needed for a quick tunnel:
  ```bash
  npm install -g --allow-scripts=cloudflared cloudflared        # one-time; --allow-scripts needed, postinstall downloads the real binary

  # terminal 2 first — get the tunnel URL before starting Metro, since Metro needs to know it upfront
  cloudflared tunnel --url http://localhost:8081                # prints a public https://*.trycloudflare.com URL — note it

  # terminal 1 — start Metro WITH that URL, via EXPO_PACKAGER_PROXY_URL (NOT REACT_NATIVE_PACKAGER_HOSTNAME,
  # which only overrides the hostname and leaves Metro's own port (8081) wrongly appended to the manifest's
  # bundle URL -- confirmed by reading apps/mobile/node_modules/@expo/cli/build/src/start/server/UrlCreator.js:
  # EXPO_PACKAGER_PROXY_URL is parsed as a full URL and its (empty) port wins, correctly producing a bare
  # https://<tunnel-host>/... bundle URL with no port at all)
  EXPO_PACKAGER_PROXY_URL=https://<your-tunnel-host>.trycloudflare.com npx expo start
  ```
  Without `EXPO_PACKAGER_PROXY_URL`, Metro embeds its own LAN hostname/port in the manifest it serves — the phone reaches the tunnel fine (gets a manifest, shows the app name) but then tries to fetch the actual JS bundle from an address only reachable on the VM's local network, and silently shows a blank white screen forever. This was confirmed directly: `curl`-ing the tunnel's manifest endpoint showed `launchAsset.url` pointing at `<host>:8081/...` — a port number that should never appear in a tunnel's public URL, since cloudflared/ngrok handle the host:8081 proxying invisibly.

  On the phone: Expo Go → "Enter URL manually" → `exp://<your-tunnel-host>.trycloudflare.com` (the `https://` form opens your phone's regular browser instead of Expo Go — use `exp://`).

  Cloudflare's free quick tunnels generate a **new random hostname every time you run the command** — if you restart `cloudflared`, you must also restart Metro with the new URL.
- VS Code's built-in **Remote-SSH port forwarding does not help here** — it only exposes a port back to the machine running the VS Code *client*, with no "Public visibility" option (that's a separate Dev Tunnels feature, not plain Remote-SSH forwarding) — confirmed by checking the actual right-click menu in this setup.

## Architecture

- `src/navigation/` — typed React Navigation (bottom tabs + nested native-stacks). See `types.ts` for every route's param list. The bottom tab bar is `react-native-animated-nav-tab-bar` (a real sliding-indicator segmented-control-style bar, not hand-rolled — see `RootTabNavigator.tsx` for why that library specifically, and `@gorhom/animated-tabbar`, which looked like the obvious choice, was rejected as abandoned/Reanimated-v1-only).
- `src/lib/api/` — the whole backend client: `http.ts`/`env.ts`/`money.ts`/`idempotency.ts`/`errors.ts` (core) plus one file per domain (`catalog`, `occasions`, `cart`, `checkout`, `orders`, `addresses`, `payments`). Ported from `apps/storefront/src/lib/api/*`, adapted to call the backend directly instead of through the web app's same-origin BFF proxy. No cookie-jar shim — relies on React Native's native HTTP stack (OkHttp/NSURLSession) persisting the backend's session cookies automatically, same as a browser would.
- `src/lib/queryClient.ts` — the single app-wide TanStack Query client, mounted once in `App.tsx`. Every feature's data hooks share this one cache.
- `src/theme/`, `src/components/ui/` — design tokens and shared primitives (Button, Input, Card, PriceText, Loading/Empty/ErrorState, Badge, **ScreenHeader**, Toast). See "Design system" below.
- `src/features/{catalog,cart,checkout,account,orders}/` — one directory per feature, each with its own `screens/`, `hooks/`, `components/`.

## Design system

Restyled against commissioned mockups in [`Supporting-document/`](../../Supporting-document/) (the "Giftory — Atelier India" direction: warm ivory canvas, shadow-lifted white cards, deep-red brand accent). A few decisions worth knowing before touching styling:

- **`theme/index.ts`** is the single source for color/spacing/radii/typography — `background` (the screen canvas) and `surface` (card fill) are deliberately inverted from a flat-UI default: cream canvas, bright white cards, so every card reads as lifted rather than blending in.
- **`ScreenHeader`** (`components/ui/ScreenHeader.tsx`) is the *only* header every screen renders. All three stack navigators set `headerShown: false` — themeing React Navigation's native header (an earlier, insufficient attempt) can't fully match a custom one; it's a structurally different platform component regardless of color/font.
- **`Toast`** is a top icon banner, not a bottom box — nothing else on any screen occupies that space, so it can't collide with a screen's own bottom CTA or the tab bar the way a bottom-anchored toast repeatedly did during testing.
- Small chips/badges carry **no shadow** — Android's `elevation` renders as a visible halo on small shapes; shadows are reserved for genuinely elevated surfaces (cards, buttons, the tab bar).

## Known limitations (read before testing)

- **Guest-only.** No login/signup/password-reset screens. Account tab shows a guest-mode banner; order history is tracked locally per-device (via `expo-secure-store`) from orders placed in this app, not a real account's full history; the address book UI is complete but gated behind a "sign in" message since its endpoints require a signed-in customer.
- **Razorpay only.** No Stripe integration in this app (the backend/web storefront support both).
- **4 wire-shape assumptions need live-backend verification**: product tax rate (defaults to 0), cart validation-error line attribution (renders as a banner, not per-line, since the real error shape doesn't carry a line id), order detail's payment/shipping-address fields (optional with safe defaults), Razorpay confirm response fields (defensively defaulted). Full detail in `spec/mobile/IMPLEMENTATION-NOTES.md`.
- **Razorpay's native-SDK field mapping (`order_id`, `amount`) is a best-effort inference** from reading the web storefront's code, not a live response — verify this first on an actual payment attempt, since a wrong field name breaks checkout silently. This is the one major flow never exercised on-device.
- **Tab bar's floating-mode bottom margin is a fixed 20px** (from `react-native-animated-nav-tab-bar`, gated on an iOS-only "is this an iPhone X" check) — it doesn't read this device's actual Android gesture-nav safe-area inset. Looked fine in testing; worth re-checking on other Android devices.
- **Verified so far**: `tsc --noEmit` passes with 0 errors; booted live on a physical Android device over a `cloudflared` tunnel against the deployed dev backend; catalog browsing (search/filter/sort), cart (add/update/remove/gift options), and navigation across every screen have been exercised on-device. Checkout (address → shipping → Razorpay payment → confirmation) has only been verified up to the payment screen rendering correctly — not an actual completed payment.
