import { Migration } from '@mikro-orm/migrations'

/**
 * Two correctness fixes applied together:
 *
 * 1. storefront_checkouts amount columns → integer paise (numeric(18,0)).
 *    Previous `numeric(18,4)` stored decimal rupees; all other internal
 *    arithmetic already ran in paise (toMinor/fromMinor in pricing.ts).
 *    Existing rows are converted with ROUND(col * 100).
 *
 * 2. storefront_cart_lines gets `deleted_at` for soft delete, consistent
 *    with the "all business entities use deleted_at" rule. The existing
 *    unique constraint on (cart_id, line_key) is replaced with a partial
 *    unique index scoped to active (non-deleted) rows so that a re-added
 *    line with the same key does not collide with its soft-deleted ancestor.
 */
export class Migration20261010000000_storefront_paise_soft_delete extends Migration {
  override name = 'Migration20261010000000_storefront_paise_soft_delete'

  override up(): void | Promise<void> {
    // ── 1. Checkout amounts: decimal rupees → integer paise ──────────────────
    this.addSql(`
      ALTER TABLE "storefront_checkouts"
        ALTER COLUMN "subtotal_amount"    TYPE numeric(18,0) USING ROUND("subtotal_amount"    * 100),
        ALTER COLUMN "shipping_amount"    TYPE numeric(18,0) USING ROUND("shipping_amount"    * 100),
        ALTER COLUMN "tax_amount"         TYPE numeric(18,0) USING ROUND("tax_amount"         * 100),
        ALTER COLUMN "grand_total_amount" TYPE numeric(18,0) USING ROUND("grand_total_amount" * 100);
    `)
    this.addSql(`
      ALTER TABLE "storefront_checkouts"
        ALTER COLUMN "subtotal_amount"    SET DEFAULT '0',
        ALTER COLUMN "shipping_amount"    SET DEFAULT '0',
        ALTER COLUMN "tax_amount"         SET DEFAULT '0',
        ALTER COLUMN "grand_total_amount" SET DEFAULT '0';
    `)

    // ── 2. Cart lines: add deleted_at + replace unique with partial index ────
    this.addSql(`ALTER TABLE "storefront_cart_lines" ADD COLUMN "deleted_at" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "storefront_cart_lines" DROP CONSTRAINT IF EXISTS "storefront_cart_lines_cart_key_uniq";`)
    this.addSql(`
      CREATE UNIQUE INDEX "storefront_cart_lines_cart_key_uniq"
        ON "storefront_cart_lines" ("cart_id", "line_key")
        WHERE "deleted_at" IS NULL;
    `)
  }

  override down(): void | Promise<void> {
    // ── 2. Cart lines: restore hard constraint, drop deleted_at ─────────────
    this.addSql(`DROP INDEX IF EXISTS "storefront_cart_lines_cart_key_uniq";`)
    this.addSql(`ALTER TABLE "storefront_cart_lines" ADD CONSTRAINT "storefront_cart_lines_cart_key_uniq" UNIQUE ("cart_id", "line_key");`)
    this.addSql(`ALTER TABLE "storefront_cart_lines" DROP COLUMN "deleted_at";`)

    // ── 1. Checkout amounts: paise → decimal rupees ──────────────────────────
    this.addSql(`
      ALTER TABLE "storefront_checkouts"
        ALTER COLUMN "subtotal_amount"    TYPE numeric(18,4) USING ("subtotal_amount"    / 100.0),
        ALTER COLUMN "shipping_amount"    TYPE numeric(18,4) USING ("shipping_amount"    / 100.0),
        ALTER COLUMN "tax_amount"         TYPE numeric(18,4) USING ("tax_amount"         / 100.0),
        ALTER COLUMN "grand_total_amount" TYPE numeric(18,4) USING ("grand_total_amount" / 100.0);
    `)
  }
}
