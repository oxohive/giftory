import { Migration } from '@mikro-orm/migrations';

export class Migration20261013232900_dealer_org_rbac extends Migration {

  override name = 'Migration20261013232900';

  override up(): void | Promise<void> {
    this.addSql(`create table "dealer_capabilities" ("id" uuid not null default gen_random_uuid(), "dealer_profile_id" uuid not null, "tenant_id" uuid not null, "product_type_codes" text[] not null, "printing_methods" text[] not null, "max_daily_capacity" int not null default 0, "serviceable_states" text[] not null, "min_order_qty" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dealer_cap_profile_idx" on "dealer_capabilities" ("dealer_profile_id", "tenant_id", "deleted_at");`);
  }

}
