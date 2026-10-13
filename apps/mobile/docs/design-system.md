# Giftory Mobile — Design System Reference

One rule for this app: **define a thing once, as a token or a shared component, and reuse it everywhere** — never style a screen independently. This doc is the canonical reference for what exists; keep it in sync whenever a token or shared component's API changes.

## Tokens (`src/theme/index.ts`)

Access via `const theme = useTheme()` inside any component (scheme-aware — resolves light/dark live from `useColorScheme()`), or `import { theme } from './src/theme'` for the rare non-component/non-hook context.

| Group | Access | Notes |
|---|---|---|
| Colors | `theme.colors.*` | Semantic tokens — `primary`, `secondary`, `accent`, `background`, `surface`, `card`, `border`, `text`/`textMuted`, `success`/`warning`/`danger`/`info`/`destructive`, state colors (`disabledBackground`/`disabledText`, `pressedOverlay`, `focusRing`, `selectedBackground`/`selectedText`, `loadingSkeleton`), `overlay` (modal scrim), `navBarBackground`/`navBarInactive`/`navBarActiveDot` (tab bar). Never hardcode a hex value in a screen — add a token here instead. |
| Spacing | `theme.spacing(n)` | `n * 8`px. `theme.spacing(2)` = 16px. |
| Radii | `theme.radii.{sm,md,lg,xl,pill}` | |
| Typography | `theme.typography.{display,heading,subheading,body,caption,small,button,label}` | Pass directly as a `TextStyle` — includes fontFamily/size/weight/lineHeight/letterSpacing. `button` and `label` exist specifically so buttons/labels/chips don't improvise from `body`/`caption`. |
| Elevation | `theme.elevation.{sm,md,lg}` | Spread into a style object — includes both iOS `shadow*` and Android `elevation`. |
| Icon sizes | `theme.sizes.icon.{sm,md,lg}` | 16/24/32. Pass to any Ionicons `size` prop. |
| Touch target | `theme.touchTarget.min` | 44 (iOS) / 48 (Android) — the minimum width/height for any pressable control. `IconButton` already enforces this; apply it yourself for any other custom pressable. |
| Motion | `theme.motion.{fast,base,slow}` | 150/220/320ms — use instead of inventing a new animation duration per component. |

## Shared components (`src/components/ui/`)

### `Button`
```tsx
<Button title="Place order" onPress={handleSubmit} variant="primary" loading={submitting} disabled={!isValid} />
```
`variant`: `'primary' | 'secondary' | 'ghost' | 'destructive'` — `'ghost'` is this app's tertiary (text-only). Use `'destructive'` for delete/remove/clear actions. For an icon-only control, use `IconButton` instead — `Button` always renders a text label.

### `IconButton`
```tsx
<IconButton icon="trash-outline" accessibilityLabel="Remove item" onPress={handleRemove} variant="surface" size="sm" badgeCount={cartCount} />
```
The one icon-only pressable in the app. `accessibilityLabel` is required at the type level. Always at least `theme.touchTarget.min` in both dimensions; fires `haptics.light()` on press automatically. `variant`: `'surface' | 'primary' | 'ghost'`.

### `Input`
```tsx
<Input
  label="Mobile number" required
  value={phone} onChangeText={setPhone} error={errors.phone?.message}
  keyboardType="phone-pad" returnKeyType="next" onSubmitEditing={() => nextRef.current?.focus()}
  ref={phoneRef}
/>
```
Forwards its ref to the underlying `TextInput` — chain fields via refs + `returnKeyType="next"`/`"done"` + `onSubmitEditing` for keyboard-driven focus movement, ending the last field's `onSubmitEditing` in a form submit. `required` shows a `*`; `showCharacterCount` + `maxLength` shows an `n/max` counter (use for any message/notes field with a length limit). Shows a focus ring (`theme.colors.focusRing`) while focused, and a distinct disabled look when `disabled`.

### `KeyboardAwareScreen`
```tsx
<KeyboardAwareScreen style={{ backgroundColor: theme.colors.background }}>
  {/* ScreenHeader + ScrollView with form fields */}
</KeyboardAwareScreen>
```
Wrap any screen that has text inputs, as the outermost element, so the keyboard doesn't cover the active field or a primary action button beneath it.

### `ScreenHeader`
```tsx
<ScreenHeader title="Products" onBack={navigation.goBack} rightAction={<IconButton ... />} />
```
The one header every screen renders (`titleIcon` optionally shows a leading glyph, used by Home's wordmark). Every stack sets `headerShown: false` and renders this instead of a native header. Render it as a fixed sibling ABOVE a screen's scrollable content, never inside a `ScrollView`'s `contentContainerStyle`.

### `Toast` (`ToastProvider` / `useToast()`)
```tsx
const { show } = useToast()
show('Added to wishlist', 'success')
show('Item removed', 'info', { action: { label: 'Undo', onPress: restoreItem } })
```
Single shared feedback system, top-anchored (never collides with a tab bar or bottom CTA). One toast visible at a time — a new call replaces the current one outright. `options.action` adds a tappable "Undo"-style action.

### `confirmDestructive` (`src/lib/confirm.ts`)
```tsx
confirmDestructive({ title: 'Remove address', message: `Remove the address for ${name}?`, confirmLabel: 'Remove', onConfirm: doDelete })
```
The one confirmation pattern for destructive actions app-wide — use this instead of calling `Alert.alert` directly.

### `Badge`
```tsx
<Badge label="Delivered" tone="success" />
```
`tone`: `'info' | 'success' | 'warning' | 'danger'`.

### `Divider`
```tsx
<Divider /> // or orientation="vertical"
```

### `LoadingState` / `EmptyState` / `ErrorState`
The shared data-fetch states. Pass `classifyApiError(error).message` (from `src/lib/api/errors.ts`) to `ErrorState`'s `message` prop instead of a raw error message where the screen doesn't already have a more specific message — this distinguishes a network failure from a server error from a validation failure, instead of one generic message everywhere.

### `ProductImage`
Every product/occasion image in the app goes through this — disk caching, fade-in, and a themed fallback icon for both a missing `uri` AND a `uri` that fails to load at runtime.

### `OfflineBanner`
Mounted once in `App.tsx`, above `NavigationContainer` — shows automatically when the device goes offline. No per-screen wiring needed.

## Shared hooks/utilities (`src/lib/`)

- `useReducedMotion()` — tracks the OS "Reduce Motion" setting live; check it before running any custom animation (see `Skeleton`/`Toast` for the pattern) and skip/shorten the animation when `true`.
- `useOnlineStatus()` — live network-connectivity boolean (backs `OfflineBanner`).
- `useSingleTapNavigation()` — `const { guard } = useSingleTapNavigation()`, then wrap any navigation call: `guard(() => navigation.navigate(...))`. Prevents duplicate navigation from rapid double-taps.
- `logger` — the one logging entry point (`logger.debug/info/warn/error(area, message, data?)`). Don't call `console.*` directly elsewhere; this is the single file to point at a real crash/analytics service later.
- `classifyApiError(err)` — network/server/validation error classification, in `src/lib/api/errors.ts` alongside `ApiError`.

## Navigation

`giftory://` deep links are mapped in `App.tsx`'s `linking` config to the real nested tab/stack route tree (`src/navigation/types.ts` is the source of truth for every route's param list). Update both together when adding a route.

## What's still out of scope here

Coupon/promo codes, a delivery date/slot picker, and a wishlist feature have no backend support in `apps/mercato` as of this writing — there's nothing for UI here to call, so none of those are built. A payment-method selector doesn't exist because this app is Razorpay-only by design (the backend/web storefront also support Stripe, which this app deliberately doesn't expose). See `docs/checklist.md` at the repo root for the full audit this fix pass was based on.
