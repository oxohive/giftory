import { Migration } from '@mikro-orm/migrations';

export class Migration20261005174424_gift_catalog extends Migration {

  override name = 'Migration20261005174424';

  override up(): void | Promise<void> {
    this.addSql(`create table "gift_occasions" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "code" text not null, "label" text not null, "description" text null, "sort_order" int not null default 0, "is_active" boolean not null default true, "image_url" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "gift_occasions_scope_idx" on "gift_occasions" ("tenant_id", "organization_id", "deleted_at");`);
    this.addSql(`alter table "gift_occasions" add constraint "gift_occasions_scope_code_uniq" unique ("tenant_id", "organization_id", "code");`);

    this.addSql(`create table "gift_product_profiles" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "product_id" uuid not null, "occasions" text[] not null default '{}', "recipient_types" text[] not null default '{}', "is_customizable" boolean not null default false, "proof_required" boolean not null default false, "gift_wrap_available" boolean not null default false, "gift_message_max_length" int not null default 250, "production_lead_time_days" int null, "personalization_notes" text null, "fulfillment_mode" text not null default 'dealer', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "gift_product_profiles_scope_idx" on "gift_product_profiles" ("tenant_id", "organization_id", "deleted_at");`);
    this.addSql(`alter table "gift_product_profiles" add constraint "gift_product_profiles_scope_product_uniq" unique ("tenant_id", "organization_id", "product_id");`);
  }

}
