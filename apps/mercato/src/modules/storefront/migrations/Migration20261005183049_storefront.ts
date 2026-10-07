import { Migration } from '@mikro-orm/migrations';

export class Migration20261005183049_storefront extends Migration {

  override name = 'Migration20261005183049';

  override up(): void | Promise<void> {
    this.addSql(`create table "storefront_addresses" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "customer_user_id" uuid not null, "full_name" text not null, "phone" text not null, "line1" text not null, "line2" text null, "city" text not null, "state" text not null, "postal_code" text not null, "country" text not null default 'IN', "is_default" boolean not null default false, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "storefront_addresses_customer_idx" on "storefront_addresses" ("tenant_id", "organization_id", "customer_user_id", "deleted_at");`);

    this.addSql(`create table "storefront_carts" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "token_hash" text null, "customer_user_id" uuid null, "currency_code" text not null, "status" text not null default 'active', "converted_order_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "storefront_carts_customer_idx" on "storefront_carts" ("tenant_id", "organization_id", "customer_user_id", "status");`);
    this.addSql(`alter table "storefront_carts" add constraint "storefront_carts_token_hash_uniq" unique ("tenant_id", "organization_id", "token_hash");`);

    this.addSql(`create table "storefront_cart_lines" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "cart_id" uuid not null, "product_id" uuid not null, "variant_id" uuid null, "quantity" int not null, "gift_wrap" boolean not null default false, "gift_message" text null, "line_key" text not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "storefront_cart_lines_scope_cart_idx" on "storefront_cart_lines" ("tenant_id", "organization_id", "cart_id");`);
    this.addSql(`alter table "storefront_cart_lines" add constraint "storefront_cart_lines_cart_key_uniq" unique ("cart_id", "line_key");`);

    this.addSql(`create table "storefront_checkouts" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "kind" text not null default 'order', "idempotency_key" text not null, "request_hash" text not null, "status" text not null default 'processing', "claimed_at" timestamptz null, "customer_user_id" uuid null, "customer_entity_id" uuid null, "order_id" uuid null, "order_number" text null, "currency_code" text not null, "subtotal_amount" numeric(18,4) not null default '0', "shipping_amount" numeric(18,4) not null default '0', "tax_amount" numeric(18,4) not null default '0', "grand_total_amount" numeric(18,4) not null default '0', "provider_key" text not null, "payment_id" uuid not null, "gateway_transaction_id" uuid null, "payment_status" text not null default 'pending', "sales_payment_id" uuid null, "payment_recorded_at" timestamptz null, "guest_access_token_hash" text null, "last_error" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "storefront_checkouts_transaction_idx" on "storefront_checkouts" ("gateway_transaction_id");`);
    this.addSql(`create index "storefront_checkouts_order_idx" on "storefront_checkouts" ("tenant_id", "organization_id", "order_id");`);
    this.addSql(`create index "storefront_checkouts_customer_idx" on "storefront_checkouts" ("tenant_id", "organization_id", "customer_user_id");`);
    this.addSql(`alter table "storefront_checkouts" add constraint "storefront_checkouts_idempotency_uniq" unique ("tenant_id", "organization_id", "idempotency_key");`);

    this.addSql(`create table "storefront_customer_links" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "customer_user_id" uuid not null, "person_entity_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "storefront_customer_links_person_idx" on "storefront_customer_links" ("tenant_id", "organization_id", "person_entity_id");`);
    this.addSql(`alter table "storefront_customer_links" add constraint "storefront_customer_links_user_uniq" unique ("tenant_id", "organization_id", "customer_user_id");`);
  }

}
