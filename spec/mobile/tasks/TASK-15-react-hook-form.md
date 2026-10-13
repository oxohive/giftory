---
id: TASK-15
title: Migrate forms to react-hook-form
status: Not Started
---

# TASK-15 — Migrate forms to react-hook-form

## Objective

Replace manual `useState` + manual zod `.safeParse()` form handling with `react-hook-form` + `@hookform/resolvers/zod`, for cleaner validation-on-blur behavior, dirty-field tracking, and less boilerplate in the two address forms. This is the lowest-urgency task in this wave — current forms work correctly, this is a maintainability improvement, not a user-facing bug fix.

## Boundaries

**You own:**
- `src/features/checkout/components/AddressForm.tsx`
- `src/features/account/components/AddressForm.tsx`

These are two **separate** files (checkout's guest address entry vs. account's saved-address CRUD) — migrate each independently, do not try to unify them into a shared component in this pass (they have different submit behavior and are owned by different features).

**Do not touch:** `src/lib/api/addresses.ts` or `src/lib/api/checkout.ts` (the `addressSchema` zod schema these forms already validate against lives there — reuse it via `@hookform/resolvers/zod`, don't redefine it), any screen, `src/theme/**`, `App.tsx`.

## Contracts consumed

The existing `addressSchema` (zod) already exported from `src/lib/api/addresses.ts` — read the real file for its exact shape (already landed, not a frozen spec). Use `zodResolver(addressSchema)` from `@hookform/resolvers/zod` as the form's resolver rather than re-implementing field-level validation.

## Acceptance criteria

- Both address forms behave identically from the user's perspective to how they do today: same fields, same India phone/PIN validation errors, same submit behavior — this is an internal refactor, not a UX change.
- Validation errors now show on blur (standard `react-hook-form` behavior) in addition to on submit, which is a minor improvement over the current submit-only validation — fine to ship as a side effect of the migration, not something to suppress.
- `npx tsc --noEmit` passes with zero errors.
- Manually trace through both forms' submit handlers to confirm the exact same data shape is still sent to `createAddress`/`updateAddress`/checkout's address state as before the migration — this is the one place a refactor could silently break something downstream.

## Dependencies to add

```
react-hook-form
@hookform/resolvers
```

## Non-goals

- No new fields, no new validation rules beyond what `addressSchema` already enforces.
- No unification of the two AddressForm components into one shared one.
