import { Migration } from '@mikro-orm/migrations'

export class Migration20261011000000_commissions extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE "commission_rules" (
        "id"                 uuid         NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"          uuid         NOT NULL,
        "dealer_profile_id"  uuid         NULL,
        "product_type_code"  text         NULL,
        "rate_bps"           integer      NOT NULL,
        "effective_from"     date         NOT NULL,
        "effective_to"       date         NULL,
        "created_by"         uuid         NOT NULL,
        "created_at"         timestamptz  NOT NULL DEFAULT now(),
        PRIMARY KEY ("id")
      );
    `)

    this.addSql(`
      CREATE INDEX "commission_rules_tenant_idx"
        ON "commission_rules" ("tenant_id", "effective_to");
    `)

    this.addSql(`
      CREATE INDEX "commission_rules_dealer_idx"
        ON "commission_rules" ("tenant_id", "dealer_profile_id", "product_type_code", "effective_to");
    `)

    this.addSql(`
      CREATE TABLE "order_commission_snapshots" (
        "id"                   uuid          NOT NULL DEFAULT gen_random_uuid(),
        "assignment_id"        uuid          NOT NULL,
        "order_id"             uuid          NOT NULL,
        "dealer_profile_id"    uuid          NOT NULL,
        "tenant_id"            uuid          NOT NULL,
        "subtotal_amount"      numeric(18,0) NOT NULL,
        "currency_code"        text          NOT NULL DEFAULT 'INR',
        "commission_rate_bps"  integer       NOT NULL,
        "commission_amount"    numeric(18,0) NOT NULL,
        "rule_id"              uuid          NULL,
        "snapshotted_at"       timestamptz   NOT NULL DEFAULT now(),
        PRIMARY KEY ("id")
      );
    `)

    this.addSql(`
      CREATE INDEX "ocs_assignment_idx"
        ON "order_commission_snapshots" ("assignment_id");
    `)

    this.addSql(`
      CREATE INDEX "ocs_dealer_idx"
        ON "order_commission_snapshots" ("tenant_id", "dealer_profile_id", "snapshotted_at");
    `)

    this.addSql(`
      CREATE INDEX "ocs_order_idx"
        ON "order_commission_snapshots" ("tenant_id", "order_id");
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "order_commission_snapshots";`)
    this.addSql(`DROP TABLE IF EXISTS "commission_rules";`)
  }
}
