# WS-A — Money safety (known gaps 2–4)

Branch: `m1/ws-a` (based on `milestone-1-hardening`). Unattended overnight run. Nothing has been pushed, nothing has been applied to any shared database.

## Status

**Done. Needs human review, then two migrations to apply.**

| Gap (from `docs/dealer-marketplace-api.md` → Known gaps) | Status |
|---|---|
| 2. `Idempotency-Key` checked but never consumed (assignments); not required at all (payouts) | **Fixed.** Real replay on assignment `POST`/`PUT`, payout `POST`, adjustment `POST` |
| 3. Payout recording has no balance guard | **Fixed.** 422 `insufficient_balance`, safe under concurrency |
| 4. `adjustment_credit` does not increase `pendingAmount` | **Fixed.** `pendingAmount = Σ credits − Σ debits` on the server and in the admin UI mirror |
| Coordinator add-on: `tenantId` in subscriber logs | **Fixed** (3 log calls) + a static guard test |

The new code paths have unit tests. They were also run against a real, **local, throwaway** Postgres 17.5: an `initdb` cluster in the session scratch dir on `127.0.0.1:55471`, not the shared Supabase DB. That run checked the concurrency claims, the migration SQL, and the unique-constraint error detection. See "Tests" below.

## What changed (files + why)

### Gap 4 — balance math (`966f434`)

- `apps/mercato/src/modules/payouts/lib/balance.ts` (new): the one place the balance formula lives. `DEALER_BALANCE_SQL` and `loadDealerBalance(em, tenantId, dealerProfileId)` return `{ pendingAmount, totalEarned, totalCredited, totalDebited }`. They are used by both balance routes and by the payout guard.
  - `pendingAmount = Σ amount(direction='credit') − Σ amount(direction='debit')`. This is the FEAT-013 "Balance View" formula and the formula in the `DealerLedgerEntry` doc comment.
  - `totalEarned = Σ commission_earned` is unchanged (lifetime commission only).
  - Sums are parsed as safe integers. An unsafe or fractional value throws instead of silently losing precision.
- `payouts/api/admin/dealers/[id]/ledger/balance/route.ts` and `payouts/api/dealer/ledger/balance/route.ts` now call `loadDealerBalance`. The response shape is unchanged: `{dealerProfileId, pendingAmount, totalEarned, currencyCode}`.
- `payouts/components/money.ts`: `computeLedgerBalanceFromEntries` (admin UI mirror) now uses the same formula. Its comment was wrong in a different way (WS-G's finding). It now matches the code.
- `payouts/components/DealerLedgerView.tsx` + `i18n/en.json`: the "Pending balance" hint text now describes the real formula.

### Gaps 2 + 3 — payouts (`2afe7f6`)

- `payouts/data/entities.ts`: new `PayoutsIdempotencyKey` entity → table `payouts_idempotency_keys`. It is unique on `(tenant_id, organization_id, idempotency_key)` and stores `operation`, `request_hash`, `ledger_entry_id`, `response_status`, `response_body`, `created_by`, `created_at`.
- `payouts/migrations/Migration20261123120000_payouts.ts` (new, **hand-written**). It was cross-checked against MikroORM migrator output on the scratch DB and is identical except for a `created_at DEFAULT now()`, which was kept on purpose for consistency with `dealer_ledger_entries`. **Not applied.**
- `payouts/lib/idempotency.ts` (new): header validation, request hashing, replay lookup, and the route driver `runIdempotentLedgerWrite`.
- `payouts/commands/entries.ts`: `record_payout` and `create_adjustment` now run through `writeGuardedLedgerEntry`. That function runs **one DB transaction** that:
  1. takes `pg_advisory_xact_lock(hashtextextended('payouts.dealer_ledger:<tenant>:<dealer>', 0))`;
  2. re-checks the idempotency key;
  3. for payouts only, reads the balance and throws `PayoutsError(422, 'insufficient_balance', …, {availableAmount, requestedAmount})` if `amount > pendingAmount`;
  4. inserts the ledger entry **and** its idempotency row, then commits.

  The `payouts.ledger_entry_created` event is emitted after commit. The commands now require `idempotencyKey` and `requestHash` in their input, so a future caller cannot bypass the store. `credit_commission` is unchanged and takes no lock (a credit can't make a payout unsafe).
- `payouts/api/admin/dealers/[id]/ledger/payout/route.ts` and `.../adjustment/route.ts`: require the header, hash the validated body, and replay or execute through `runIdempotentLedgerWrite`. The OpenAPI docs now list the header and the 400/409/422 errors.
- `payouts/lib/errors.ts` (new): `PayoutsError` and the `Translate`/`RouteCtx` types moved here and are re-exported from `lib/http.ts`, so existing imports keep working. Without the move, command code and its tests would pull in the DI container and the ESM-only DB driver.
- `payouts/api/openapi.ts`: `ledgerWriteHeadersSchema`, `ledgerWriteErrorSchema`, and an updated `pendingAmount` description.
- Admin UI:
  - `components/idempotencyKey.ts` (new): one key per dialog session.
  - `RecordPayoutDialog.tsx` and `CreateAdjustmentDialog.tsx` send `Idempotency-Key`. The key is kept across resubmits and released on close or success.
  - `ledgerActions.ts`: `classifyLedgerMutationFailure` maps `insufficient_balance` to an inline field error showing the available amount, and `idempotency_key_reused` to a "check the ledger" message.
  - `submitGuard.ts`: comment updated.
  - `i18n/en.json`: new strings.

### Gap 2 — dealer_orders assignments (`ecf5fb9`)

- `dealer_orders/data/entities.ts`: new `DealerOrderIdempotencyKey` → table `dealer_order_idempotency_keys`. It is unique on `(tenant_id, organization_id, idempotency_key)` and also stores `status` (`processing|completed`), `claimed_at`, `response_status`, `response_body`.
- `dealer_orders/migrations/Migration20261123174400_dealer_orders.ts` (new): SQL produced by MikroORM's migrator, run against the scratch DB with the same options `yarn db:generate` uses. The migrator also emitted **pre-existing, unrelated snapshot drift** for `dealer_order_assignments`: no-op `timestamptz` re-declarations and `status SET DEFAULT 'assigned'`. That drift was deliberately left out. `.snapshot-open-mercato.json` gained only the new table; existing entries are byte-identical. **Not applied.**
- `dealer_orders/lib/idempotency.ts` (new). It uses the storefront checkout claim pattern, because the assignment commands go through the command bus, run several statements, and emit events, so they can't share one transaction with the key row. The flow:
  1. insert a `processing` claim;
  2. run the command;
  3. mark the claim `completed` with the response, or delete it if the command failed.

  Outcomes for a repeated key:
  - Same key, same body, completed → replay with `Idempotent-Replayed: true`.
  - Different body or operation → 409 `idempotency_key_reused`.
  - Same body while the first request is still running → 409 `idempotency_request_in_progress`.
  - A `processing` claim older than 2 min (the same stale window as the storefront) can be taken over by exactly one same-payload retry, using a compare-and-set on `claimed_at`.
- `dealer_orders/api/admin/orders/[id]/assignment/route.ts`: `POST` (201) and `PUT` (200) now go through `runIdempotentAssignmentWrite`, and the OpenAPI docs now list the header and errors. `DELETE` (cancel) is unchanged and still doesn't require a key, as per API-CONTRACTS.
- `dealer_orders/lib/errors.ts` (new): `DealerOrdersError` moved here and re-exported from `lib/http.ts`. The old presence-only `requireIdempotencyKey` was removed from `lib/http.ts`; the stricter one lives in `lib/idempotency.ts`.
- Admin UI:
  - `assignmentActions.ts`: 400 `idempotency_key_invalid` is now classified as `idempotency_key_required`. It was previously misread as "order not paid". 409 `idempotency_request_in_progress` → `in_progress`.
  - `AssignDialog.tsx`: keeps its key and shows "still being processed" on `in_progress`.
  - `idempotencyKeys.ts`: comment updated.
  - `i18n/en.json`: new strings.

### Coordinator add-on — no tenant ids in logs (`82a19ff`)

- `dealer_orders/subscribers/notify-dealer-on-assignment.ts`: removed `tenantId` from 2 log calls.
- `commissions/subscribers/snapshot-on-assignment.ts`: removed `tenantId` from 1 log call. This is the only `commissions` change.
- `dealer_orders/__tests__/noTenantIdsInLogs.test.ts` (new): a static scan of every server-side `logger.*(...)` call in `dealer_orders`, `commissions` and `payouts`. It fails if a log call includes `tenantId`, `organizationId` or `orgId`. It was confirmed to flag the 3 removed calls when run against the old sources.

## Tests added and exact commands/results

All commands run in `apps/mercato` of the worktree (node_modules is a junction to the main checkout).

New/changed unit tests:
- `payouts/__tests__/balance.test.ts`: every entry type (`commission_earned`, `payout_disbursed`, `adjustment_credit`, `adjustment_debit`, plus combinations, negative, and empty) checked against `pendingAmount` and `totalEarned`, on the server and in the UI mirror. Also covers safe-integer parsing and the SQL parameters.
- `payouts/__tests__/ledgerWrites.test.ts`:
  - operation order (lock → key check → balance → insert → commit);
  - payouts below, equal to, one paisa over, and against a negative balance;
  - no write and no event on rejection;
  - race signal when the key was consumed while waiting for the lock;
  - unique violation on the key → race signal; other errors are rethrown;
  - adjustments are not balance-guarded;
  - the command requires the key and hash;
  - the event is emitted only after commit.
- `payouts/__tests__/ledgerWriteRoutes.test.ts`: route level, covering:
  - 400 for a missing or malformed key;
  - first use executes with key and hash;
  - replay without executing (with the header);
  - whitespace-normalised note counts as the same request;
  - 409 when the amount, operation, or adjustment direction changes;
  - concurrent-race replay, and 409 after a race;
  - 422 `insufficient_balance` body;
  - invalid body never touches the store.
- `payouts/components/__tests__/idempotencyKey.test.ts`: key lifecycle, key format, and error classification.
- `payouts/components/__tests__/money.test.ts`: the adjustment-credit expectation changed from 100000 to 105000 (this is the fix).
- `dealer_orders/__tests__/assignmentIdempotency.test.ts`:
  - header validation;
  - `decideExistingClaim`;
  - concurrent claims (1 wins, the rest get `in_progress`);
  - org scoping;
  - stale reclaim happens exactly once;
  - routes: POST replay, 409 on a different dealer, failure releases the key (a corrected retry works), in-flight duplicate gets 409 and is not executed, validation never touches the store;
  - PUT replay (a reassign is never executed twice), and an assign key can't be replayed as a reassign.
- `dealer_orders/components/__tests__/assignmentActions.test.ts`: 3 new classification cases.
- `dealer_orders/__tests__/noTenantIdsInLogs.test.ts`.

Results:
- `yarn test` → **Test Suites: 1 failed, 69 passed, 70 total; Tests: 1 failed, 786 passed, 787 total.** The single failure is the known Windows-only `commissions/components/__tests__/snapshotsAreReadOnlyInTheUi.test.ts`, which WS-D owns.
- `yarn typecheck` → 147 errors, the same set as the pre-change baseline (147). **0 new errors.** I diffed the sorted error lists with line numbers stripped. None of the 147 are in files this workstream added.
- `yarn lint` → exit 0: **0 errors**, 9 warnings, all pre-existing and none in `payouts`/`dealer_orders`/`commissions`.
- Real-Postgres verification: local throwaway PG 17.5, driving the **actual** TS command and lib code through MikroORM via `tsx`. The scripts are not committed because they `DROP TABLE` in whatever DB they point at. Copies are in the session scratchpad `wsa-scripts/` folder (`pgcheck-payouts.ts`, `pgcheck-orders.ts`, `gen-migrations.ts`). All checks passed:
  - all three payouts migrations, including the new one, apply cleanly;
  - commission credit 100000 → pending 100000 / earned 100000;
  - adjustment_credit 5000 → 105000 / 100000;
  - adjustment_debit 15000 → 90000 / 100000;
  - a payout of balance+1 is rejected with 422, and its key is not consumed;
  - **5 concurrent 30000 payouts against a 90000 balance → exactly 3 succeed, 2 get `insufficient_balance`, final balance 0;**
  - **5 concurrent same-key payouts → exactly 1 ledger entry, 4 race signals** (the route turns each into a replay);
  - the same key used concurrently for two different dealers → 1 entry, 1 race signal (caught by the unique constraint, with `isUniqueViolation` matching the constraint name);
  - the stored replay row holds 201 + `{id}`;
  - the dealer_orders migration applies;
  - 5 concurrent claims → 1 claimed, 4 `in_progress`;
  - a same-key retry replays with 1 execution;
  - a different hash → 409;
  - a failed command releases its claim;
  - a stale claim is taken over by exactly 1 of 3 concurrent retries.

## Decisions made and reasoning

1. **Reused the Phase 1 idempotency mechanism rather than inventing one.** There is no generic helper in `@open-mercato/shared`. Core modules (`shipping_carriers`, `payment_gateways`) and our `storefront` checkout all use the same per-module pattern: a scoped unique key, a SHA-256 of the canonical request, and a stored outcome. Both new stores import `normalizeIdempotencyKey` and `hashRequest` from `@/modules/storefront/lib/idempotency`. Those are pure functions with no ORM imports, so this is not a cross-module ORM relation. Each module owns its own table, because module isolation rules out a shared table.
2. **Key format tightened to the storefront rule (16–128 chars `[A-Za-z0-9_\-:.]`) on all four routes.** The assignment routes used to accept any non-empty string. All in-repo callers already comply: the UI sends UUIDs and the integration spec sends `assign-<uuid>`. `apps/dealer-portal` does **not** call any of these routes, which I checked by grepping its `src`.
3. **Failed requests never consume a key.** This matches the storefront's "drop a claim that never produced an order". It also matches the existing assign dialog, which keeps its key across a validation/"order not paid" error and may resubmit a corrected body. The trade-off: a corrected body after a *failed* first attempt is allowed. A changed body after a *successful* first attempt (lost response) is a 409, so a payout can't be recorded twice.
4. **Payouts: single transaction instead of claim/complete.** Money writes get the strongest guarantee: the key row exists if and only if the ledger entry exists, with no crash window. This works because I control the whole command. The assignment commands go through the command bus, run several steps, and emit events, so there I used the storefront claim pattern instead.
5. **Concurrency control: transaction-scoped advisory lock per (tenant, dealer).** Alternatives considered:
   - `SELECT … FOR UPDATE` on `dealer_profiles`: rejected. That row is owned by another module, it would couple payouts to that table, and an update there would block on it.
   - A materialised balance row with a version or lock: rejected. It adds a mutable row next to an append-only ledger, needs a backfill, and is more to get wrong.
   - `SERIALIZABLE` isolation: rejected. It needs retry loops for serialization failures.

   The advisory lock needs no schema change, is released automatically on commit or rollback, and keeps the ledger strictly append-only. Under READ COMMITTED each statement after the lock sees everything the previous holder committed. Adjustments take the same lock, so a payout never checks a balance that a concurrent adjustment debit is about to change. Commission credits don't take it (credits only make a payout safer). `hashtextextended` collisions only cause unrelated dealers to wait briefly.
6. **Balance semantics (gap 4).** `pendingAmount = Σ credits − Σ debits`, per FEAT-013 ("Balance = SUM(credit) − SUM(debit)") and the entity's own doc comment. `totalEarned` stays commission-only, since FEAT-013 calls it "lifetime" and the openapi/UI already label it "Commissions only". Alternative not taken: `totalEarned = commissions + adjustment_credit − adjustment_debit` (net earnings). It is defensible, but it changes what the dealer portal's "Total earned" card means; that is a product call. The response shape is unchanged.
7. **Adjustments are not balance-guarded.** An `adjustment_debit` is a correction (e.g. a clawback for a refunded order) and may legitimately take the balance negative, as the docs already state. Only `payout_disbursed` is guarded. A payout equal to the balance is allowed and leaves 0.
8. **Error codes.**
   - 422 `insufficient_balance` with `availableAmount` and `requestedAmount` in paise. The caller is an admin who can already see the balance, so exposing it is fine.
   - 400 `idempotency_key_required` / `idempotency_key_invalid`.
   - 409 `idempotency_key_reused`.
   - 409 `idempotency_request_in_progress` (assignments only; also a defensive fallback in payouts).
   - Replays carry the header `Idempotent-Replayed: true`.

## Not done and why

- **Did not edit `docs/dealer-marketplace-api.md`** (the coordinator owns it). The proposed text is below.
- **Did not update `spec/phase-2/features/FEAT-011/FEAT-013` or `apps/storefront/docs/backend-api-contract.md`.** The storefront doc doesn't cover these admin routes, and the coordinator is consolidating docs. Suggested FEAT-013 additions: the payout guard, the required `Idempotency-Key`, and the balance formula clarification.
- **Commission-credit de-duplication** (redelivered `commission.snapshot_created` can double-credit, because the reference index is not unique). This was out of scope for gaps 2–4. It needs a unique index on `(reference_type, reference_id)` for `commission_earned`, plus a check that no duplicates exist in the shared DB before applying. That makes it a data decision.
- **Retention/cleanup of idempotency rows**: rows are kept forever, as `storefront_checkouts` does. A cleanup job can come later.
- **Snapshot drift in `dealer_orders`** (see migration header): pre-existing and harmless, and left alone. The next real `yarn db:generate` will emit `ALTER … SET DEFAULT 'assigned'` and no-op type casts for `dealer_order_assignments`. Review that, don't be surprised by it.
- `payouts` still has no `.snapshot-open-mercato.json` (it never had one). I did not create one.

## Actions the human must take

1. **Review, then apply the two new migrations** with `yarn db:migrate` against the dev DB, as part of the normal deploy flow. Both are purely additive (new tables only):
   - `apps/mercato/src/modules/payouts/migrations/Migration20261123120000_payouts.ts` (hand-written, cross-checked)
   - `apps/mercato/src/modules/dealer_orders/migrations/Migration20261123174400_dealer_orders.ts` (migrator-generated)

   **Deploy order matters:** the new code fails with `relation … does not exist` on these four routes until the migrations are applied.
2. Run `yarn generate` after merging (new entities). The generated output is gitignored.
3. **Breaking API change for any external caller:** `POST .../ledger/payout` and `.../ledger/adjustment` now return 400 without an `Idempotency-Key`. All four routes reject keys shorter than 16 chars or with other characters. In-repo callers are updated. Tell anyone scripting against these routes.
4. Optionally run the integration journey (`dealer_orders/__integration__/dealer-marketplace-journey.spec.ts`) after migrating. It sends `assign-<orderId>` (valid) and doesn't hit the payout routes.
5. Decide whether `totalEarned` should stay commission-only (current behaviour) or become net of adjustments (see Decision 6).

## Risks

- **Assignments have a small crash window.** If the process dies after the assignment is written but before the claim is marked `completed`, a same-key retry after 2 minutes re-executes. For `assign` this is harmless: the active-assignment 409 stops it. For `reassign` the order would be reassigned again to the same dealer, creating one extra cancelled history row and a second notification email. Payouts don't have this window.
- **A failed completion write** (DB error between the command and the claim update) is logged and the success response is still returned. The same stale-claim behaviour then applies.
- **Advisory locks** serialise payout and adjustment writes per dealer. The volume is admin-driven and tiny, so this is not a throughput concern. The lock is held only for a few statements.
- **Balance numbers change for any dealer who already has `adjustment_credit` rows in the dev DB.** Their `pendingAmount` goes up by those amounts. That is the bug fix, but it will be visible.
- The new `@/modules/storefront/lib/idempotency` import makes `payouts` and `dealer_orders` depend on that storefront file at build time. It is pure and has no side effects, but moving or renaming it will break these two modules.

## Proposed replacement text for `docs/dealer-marketplace-api.md`

Replace Known gaps items 2–4 with:

```markdown
2. ~~**`Idempotency-Key` is checked for presence but never consumed.**~~ **Fixed.** Assignment `POST`/`PUT` and payout/adjustment `POST` all require `Idempotency-Key` (16–128 chars of `[A-Za-z0-9_-:.]`, same rule as storefront checkout; 400 `idempotency_key_required` / `idempotency_key_invalid`). Keys are scoped to the caller's tenant + organization and bound to a SHA-256 of the validated request. Same key + same body replays the stored response (same status and body, header `Idempotent-Replayed: true`) without executing again; same key + different body (or another route) is 409 `idempotency_key_reused`; a duplicate while the first assignment request is still running is 409 `idempotency_request_in_progress`. A request that fails does not consume its key. Stores: `payouts_idempotency_keys` (written in the same transaction as the ledger entry) and `dealer_order_idempotency_keys` (claim → complete, storefront pattern). `DELETE .../assignment` still takes no key.
3. ~~**Payout recording has no balance guard.**~~ **Fixed.** `POST .../ledger/payout` returns 422 `insufficient_balance` (`availableAmount`, `requestedAmount` in paise) when `amount > pendingAmount`. The check and the insert run in one transaction under a per-dealer `pg_advisory_xact_lock`, so concurrent payouts cannot both pass; adjustments take the same lock but are not guarded (an `adjustment_debit` may still take the balance negative). The ledger remains append-only.
4. ~~**`adjustment_credit` does not increase `pendingAmount`.**~~ **Fixed.** `pendingAmount = Σ credits − Σ debits` (commission and adjustment credits; payouts and adjustment debits); `totalEarned` remains lifetime `commission_earned` only. One implementation (`payouts/lib/balance.ts`) backs both balance routes and the payout guard; the admin UI mirror (`components/money.ts`) matches it.
```

Also update these sections of that doc:
- "Balance math": replace the formula block with `pendingAmount = Σ amount WHERE direction='credit' − Σ amount WHERE direction='debit'`, `totalEarned = Σ amount WHERE entry_type='commission_earned'`, and drop the "Note the current semantics" sentence.
- "`POST .../ledger/payout`": replace "**No balance-sufficiency check and no idempotency key** … Repeated calls double-debit." with "Requires `Idempotency-Key`; rejected with 422 `insufficient_balance` when the amount exceeds `pendingAmount`; retries with the same key replay the original 201."
- "`POST .../ledger/adjustment`": add "Requires `Idempotency-Key` (same replay semantics)."
- Assignment `POST`/`PUT` section(s): note the replay semantics above.
- "Earnings pipeline" log note: subscriber logs no longer include tenant ids.
