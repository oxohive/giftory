---
id: TASK-02
title: Design system — theme tokens + shared UI primitives
status: Done (sandbox-verified — see spec/mobile/IMPLEMENTATION-NOTES.md)
---

# TASK-02 — Design system

## Objective

Build the shared visual language every feature screen uses: theme tokens and a small set of UI primitives, matching the root `CLAUDE.md` convention ("use shared UI/tokens and cover loading/empty/error/conflict/keyboard/a11y"). This task has no dependency on any other task and can run fully in parallel from the start.

## Boundaries

**You own:** `apps/mobile/src/theme/**`, `apps/mobile/src/components/ui/**`.

**Do not touch:** navigation, `src/lib/api/**`, any `src/features/**` file, `package.json`/`app.json` (if you need a new dependency — e.g. an icon set — list it under **Dependencies to add** below, do not install it yourself).

## Contracts produced

`src/theme/index.ts`:
```ts
export const theme = {
  colors: {
    background: string, surface: string, text: string, textMuted: string,
    primary: string, primaryText: string, border: string,
    success: string, warning: string, danger: string,
  },
  spacing: (multiplier: number) => number, // e.g. spacing(2) => 16
  radii: { sm: number, md: number, lg: number },
  typography: {
    heading: TextStyle, subheading: TextStyle, body: TextStyle, caption: TextStyle,
  },
}
export function useTheme(): typeof theme
```

`src/components/ui/Button.tsx`:
```ts
export interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
  disabled?: boolean
  accessibilityLabel?: string
}
export function Button(props: ButtonProps): JSX.Element
```

`src/components/ui/Input.tsx`:
```ts
export interface InputProps {
  label: string
  value: string
  onChangeText: (value: string) => void
  error?: string
  placeholder?: string
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address'
  secureTextEntry?: boolean
  maxLength?: number
  accessibilityLabel?: string
}
export function Input(props: InputProps): JSX.Element
```

`src/components/ui/Card.tsx`:
```ts
export interface CardProps { children: React.ReactNode; style?: StyleProp<ViewStyle> }
export function Card(props: CardProps): JSX.Element
```

`src/components/ui/PriceText.tsx`:
```ts
export interface PriceTextProps { amountMajor: number; currencyCode?: string; style?: StyleProp<TextStyle> }
// Formats INR using the same convention as apps/storefront/src/lib/money.ts formatMoney()
// (Intl.NumberFormat 'en-IN'). amountMajor is a DECIMAL major-unit number (e.g. 499.00),
// matching the wire format — do NOT pass minor units here.
export function PriceText(props: PriceTextProps): JSX.Element
```

`src/components/ui/LoadingState.tsx`, `EmptyState.tsx`, `ErrorState.tsx`:
```ts
export function LoadingState(props: { label?: string }): JSX.Element
export function EmptyState(props: { title: string; description?: string; action?: React.ReactNode }): JSX.Element
export function ErrorState(props: { message: string; onRetry?: () => void }): JSX.Element
```

`src/components/ui/Badge.tsx`:
```ts
export function Badge(props: { label: string; tone?: 'info' | 'success' | 'warning' }): JSX.Element
```

## Backend endpoints used

None — this is a pure UI/presentation task.

## Acceptance criteria

- Every component renders correctly in both a light-background and a themed screen (no hardcoded colors outside `theme`).
- `Button` shows a spinner and is non-interactive when `loading` or `disabled` is true (mirrors FEAT-004's checkout button states).
- `Input` renders its `error` string below the field and sets `accessibilityLabel`/`accessible` props so screen readers announce label + error.
- `PriceText` renders `₹499.00`-style formatting for any INR decimal input (matches `apps/storefront/src/lib/money.ts: formatMoney()`).
- `EmptyState`/`ErrorState`/`LoadingState` are generic enough that TASK-05 through TASK-08 can drop them into product list, cart, and order screens unmodified.

## Dependencies to add

```
# none required for a basic implementation; if you choose an icon library
# (e.g. @expo/vector-icons — already bundled with Expo, no install needed)
# list it here only if it's something extra.
```

## Non-goals

- No business logic, no API calls, no navigation.
- No dark mode is required for v1 (a single light theme object is sufficient) — structure `theme` so a future dark variant is a straightforward addition, but do not build it now.
