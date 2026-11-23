import { Migration } from '@mikro-orm/migrations'

/**
 * HAND-WRITTEN (WS-A, Milestone 1) — `yarn db:generate` needs a live database
 * connection and none was available to the agent that wrote this. Mirrors
 * `PayoutsIdempotencyKey` in `../data/entities.ts`. Review before applying.
 *
 * Adds the replay store for `Idempotency-Key` on the admin ledger write
 * routes. Purely additive — no existing table or row is touched.
 */
export class Migration20261123120000_payouts extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE "payouts_idempotency_keys" (
        "id"               uuid        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"        uuid        NOT NULL,
        "organization_id"  uuid        NOT NULL,
        "idempotency_key"  text        NOT NULL,
        "operation"        text        NOT NULL,
        "request_hash"     text        NOT NULL,
        "ledger_entry_id"  uuid        NOT NULL,
        "response_status"  int         NOT NULL,
        "response_body"    jsonb       NOT NULL,
        "created_by"       uuid        NULL,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("id")
      );
    `)

    this.addSql(`
      ALTER TABLE "payouts_idempotency_keys"
        ADD CONSTRAINT "payouts_idempotency_keys_scope_key_uniq"
        UNIQUE ("tenant_id", "organization_id", "idempotency_key");
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "payouts_idempotency_keys";`)
  }
}
