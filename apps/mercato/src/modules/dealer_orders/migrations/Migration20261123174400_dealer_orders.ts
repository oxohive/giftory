import { Migration } from '@mikro-orm/migrations';

/**
 * WS-A (Milestone 1): replay store for `Idempotency-Key` on the admin
 * assignment routes. Purely additive.
 *
 * SQL produced by MikroORM's migrator (same options as `yarn db:generate`)
 * diffing the entities against this module's snapshot, run against a local
 * scratch Postgres 17 — NOT the shared dev database. The migrator's output
 * also contained unrelated pre-existing snapshot drift for
 * `dealer_order_assignments` (no-op `timestamptz` re-declarations and a
 * `status` default); that was deliberately left out of this migration. NOT
 * YET APPLIED anywhere — review, then `yarn db:migrate`.
 */
export class Migration20261123174400_dealer_orders extends Migration {

  override name = 'Migration20261123174400';

  override up(): void | Promise<void> {
    this.addSql(`create table "dealer_order_idempotency_keys" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "idempotency_key" text not null, "operation" text not null, "request_hash" text not null, "status" text not null default 'processing', "claimed_at" timestamptz not null, "response_status" int null, "response_body" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "dealer_order_idempotency_keys" add constraint "dealer_order_idempotency_keys_scope_key_uniq" unique ("tenant_id", "organization_id", "idempotency_key");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dealer_order_idempotency_keys";`);
  }

}
