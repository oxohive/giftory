import { Migration } from '@mikro-orm/migrations'

export class Migration20261012000000_payouts extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE "dealer_ledger_entries" (
        "id"                uuid          NOT NULL DEFAULT gen_random_uuid(),
        "dealer_profile_id" uuid          NOT NULL,
        "tenant_id"         uuid          NOT NULL,
        "entry_type"        text          NOT NULL,
        "amount"            numeric(18,0) NOT NULL,
        "currency_code"     text          NOT NULL DEFAULT 'INR',
        "direction"         text          NOT NULL,
        "reference_type"    text          NOT NULL,
        "reference_id"      uuid          NOT NULL,
        "note"              text          NULL,
        "created_by"        uuid          NOT NULL,
        "created_at"        timestamptz   NOT NULL DEFAULT now(),
        PRIMARY KEY ("id")
      );
    `)

    this.addSql(`
      CREATE INDEX "dle_dealer_idx"
        ON "dealer_ledger_entries" ("tenant_id", "dealer_profile_id", "created_at");
    `)

    this.addSql(`
      CREATE INDEX "dle_reference_idx"
        ON "dealer_ledger_entries" ("reference_type", "reference_id");
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "dealer_ledger_entries";`)
  }
}
