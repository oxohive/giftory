# ADR-001: Target Launch Region

- **Status:** Proposed
- **Deciders:** Platform operator / business owner
- **Date:** 2026-10-10

## Context

Several architecture choices depend on the launch region: payment provider selection, KYC requirements, tax rules, shipping provider, privacy law (PDPB vs GDPR), and currency. The current codebase implies India (INR base currency, Razorpay integration, GSTIN in dealer onboarding spec), but this has not been formally confirmed.

## Decision

*(To be confirmed by business owner.)*

Proposed: **India (INR)** as the sole launch region for Phases 2–4.

Rationale:
- Razorpay and Stripe both operate in India; split payout options exist via Razorpay Route or Stripe Connect.
- GSTIN-based dealer KYC is already specced in FEAT-008.
- Base currency is INR throughout Phase 1.
- Shipping aggregators (Shiprocket, Delhivery) cover India well.

## Consequences

- KYC spec (FEAT-008) uses GSTIN + PAN — correct for India.
- All monetary amounts stored in INR paise (integer minor units).
- Tax: GST applies; tax calculation module to be added in a later phase (out of Phase 2 scope).
- Privacy: India's DPDP Act 2023 governs PII — encryption at rest for PII fields (already enforced via `TENANT_DATA_ENCRYPTION`).
- If the region decision changes to multi-region: currency, KYC document types, and tax rules all need to be parameterized before Phase 2 implementation begins.

## Alternatives Considered

- **Multi-region from day one:** too much scope; deferred to Phase 9.
- **UAE / Singapore:** viable, but would require different KYC documents, currency, and no Razorpay.
