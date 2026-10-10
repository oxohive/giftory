# ADR-002: Payment Provider for Marketplace Split Payouts

- **Status:** Proposed
- **Deciders:** Platform operator / business owner + tech lead
- **Date:** 2026-10-10

## Context

The platform collects payment from the customer (via Stripe or Razorpay), deducts a platform fee, and pays the dealer their commission. This "split payout" or "marketplace settlement" model requires specific payment provider support that differs from standard payment collection.

Phase 2 (FEAT-013) builds the ledger and tracks what is owed; actual disbursement is Phase 9. The decision must be made now because:
1. The ledger schema references a `reference_id` for payout entries — the provider affects what that ID looks like.
2. Dealer onboarding (FEAT-008) may need to collect a bank account or provider-specific ID.
3. The provider's onboarding requirements affect KYC (FEAT-008) complexity.

## Options

### Option A — Razorpay Route (India)

- **How it works:** Razorpay Route transfers a portion of an incoming payment to a linked "contact" (the dealer's bank account or UPI) within the same transaction.
- **Pros:** Native India support, INR, UPI/NEFT/IMPS transfers, simpler compliance for India-only launch, lower fees for INR transfers.
- **Cons:** India-only — cannot expand to international dealers without switching providers; Razorpay Route requires dealer bank account verification (not just GSTIN).
- **Dealer onboarding impact:** Dealer must provide bank account details + IFSC for Razorpay Route KYC.

### Option B — Stripe Connect (Global)

- **How it works:** Each dealer is a Stripe Connect "Express" account. Stripe handles KYC, tax forms, and international payouts.
- **Pros:** Global coverage, handles international dealers, Stripe manages compliance.
- **Cons:** Higher fees; Stripe Connect Express is available in India but less commonly used than Razorpay; Express onboarding UX is Stripe-hosted.
- **Dealer onboarding impact:** Dealer completes Stripe's onboarding flow (Stripe-hosted, redirected from dealer portal).

### Option C — Manual bank transfer (Phase 2 only, deferred decision)

- The ledger tracks what is owed; payouts are done manually by the operator via NEFT/IMPS with the UTR recorded in the ledger.
- **Pros:** Zero integration complexity in Phase 2; works with any bank.
- **Cons:** Does not scale; no automation path without a separate integration later.
- **Dealer onboarding impact:** Only bank account details needed (no provider-specific setup).

## Recommendation

*(Requires business owner input.)*

Suggested path: **Option C for Phase 2** (manual, deferred) + **Option A (Razorpay Route) for Phase 9** if India-only, or **Option B (Stripe Connect)** if multi-region is planned.

This keeps Phase 2 unblocked while the business decision is made. FEAT-013 ledger design is provider-agnostic.

## Consequences

- If Option A: Dealer KYC (FEAT-008) must collect bank account + IFSC. Razorpay Route must be integrated in Phase 9.
- If Option B: Dealer onboarding includes a Stripe Connect flow. The `dealer_profiles` table needs a `stripe_account_id` column.
- If Option C: No provider-specific fields needed in Phase 2; add them in Phase 9 when the decision is finalized.
