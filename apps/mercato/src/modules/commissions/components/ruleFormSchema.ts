import { z } from 'zod'
// Real backend schema (no server-only runtime deps — see data/validators.ts),
// reused here so client-side validation can never drift from what the
// `POST /api/commissions/admin/commission/rules` route actually enforces.
import { commissionRuleCreateSchema } from '../data/validators'
import { MIN_RATE_BPS, MAX_RATE_BPS } from './money'
import { classifyRuleScope } from './ruleScope'

/**
 * `CrudForm` validates the raw form `values` object — where an unset
 * combobox/text field is `''`, not `undefined`/`null`. The real
 * `commissionRuleCreateSchema`'s `dealerProfileId`/`productTypeCode` are
 * `.nullable().optional()`, which rejects `''` outright (it is neither a
 * valid UUID nor `null`/`undefined`). `.extend()` swaps in a
 * preprocess-empty-string-to-null wrapper for just those two keys so a
 * blank field reaches the real validator as `null` — every other field
 * (`rateBps` bounds, `effectiveFrom` format) still runs the untouched
 * backend validator.
 */
const emptyStringToNull = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === '' ? null : v), schema)

/**
 * The real `commissionRuleCreateSchema` (empty-string-tolerant, see above)
 * plus one client-only UX guard: a platform-wide rule (`dealerProfileId`
 * empty) combined with a `productTypeCode` is syntactically valid against
 * the backend schema, but `rateResolver.ts` never matches that combination
 * (its product-type lookup always queries a specific dealer id — see
 * `ruleScope.ts`'s doc comment). Blocking it here saves the admin from
 * creating a rule that can never apply to any order; it is not a
 * backend-enforced limit.
 *
 * Kept in its own module (rather than inline in `CommissionRuleCreateForm.tsx`)
 * so it can be unit-tested without pulling React/`CrudForm` into the test.
 */
export const commissionRuleClientFormSchema = commissionRuleCreateSchema
  .extend({
    dealerProfileId: emptyStringToNull(z.string().uuid().nullable().optional()),
    productTypeCode: emptyStringToNull(z.string().trim().min(1).max(100).nullable().optional()),
    // NumberInput's onChange can hand back a string while the admin is
    // mid-edit — coerce to a number before the real [MIN_RATE_BPS,
    // MAX_RATE_BPS] bounds (same constants the backend enforces) apply.
    rateBps: z.preprocess(
      (v) => (typeof v === 'string' && v.trim().length ? Number(v) : v),
      z.number().int().min(MIN_RATE_BPS).max(MAX_RATE_BPS),
    ),
  })
  .superRefine((value, ctx) => {
    const scope = classifyRuleScope({
      dealerProfileId: value.dealerProfileId ?? null,
      productTypeCode: value.productTypeCode ?? null,
    })
    if (scope === 'unreachable_platform_product_type') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productTypeCode'],
        message: 'commissions.admin.rules.form.errors.unreachableScope',
      })
    }
  })
