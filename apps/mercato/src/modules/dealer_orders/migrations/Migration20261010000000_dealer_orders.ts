import { Migration } from '@mikro-orm/migrations';

export class Migration20261010000000_dealer_orders extends Migration {

  override name = 'Migration20261010000000';

  override up(): void | Promise<void> {
    this.addSql(`create table "dealer_order_assignments" (
      "id" uuid not null default gen_random_uuid(),
      "order_id" uuid not null,
      "dealer_profile_id" uuid not null,
      "tenant_id" uuid not null,
      "organization_id" uuid not null,
      "assigned_by" uuid not null,
      "assigned_at" timestamptz not null,
      "required_by" date not null,
      "status" text not null,
      "status_updated_at" timestamptz not null,
      "status_note" text null,
      "cancelled_reason" text null,
      "created_at" timestamptz not null,
      "updated_at" timestamptz not null,
      "deleted_at" timestamptz null,
      primary key ("id")
    );`);
    this.addSql(`create index "doa_scope_idx" on "dealer_order_assignments" ("tenant_id", "organization_id", "deleted_at");`);
    this.addSql(`create index "doa_order_idx" on "dealer_order_assignments" ("tenant_id", "order_id", "deleted_at");`);
    this.addSql(`create index "doa_dealer_idx" on "dealer_order_assignments" ("tenant_id", "dealer_profile_id", "deleted_at");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dealer_order_assignments";`);
  }

}
