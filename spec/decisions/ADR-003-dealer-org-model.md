# ADR-003: Dealer Organization Model — OM `directory` vs Custom Module

- **Status:** Proposed — requires a spike
- **Deciders:** Tech lead
- **Date:** 2026-10-10

## Context

Dealers need to be modeled as organizations within Open Mercato so that:
- They get isolated data scoped to `tenantId + organizationId`.
- They can have users (owner + staff) with dealer-specific roles.
- The existing OM auth, RBAC, and multi-tenancy machinery applies without duplication.

Open Mercato has a `directory` module (organizations, contacts, locations). It is unclear whether this module supports the dealer use case or whether a custom `dealer` module is needed.

## Question

Can the OM `directory` module model dealers as organizations with:
1. A custom organization type (`dealer`)
2. Custom role assignments (`dealer:owner`, `dealer:staff`)
3. Custom data linked to the organization (capabilities, KYC status)
4. Scoped API access — dealer users can only see their own organization's data

## Options

### Option A — Extend OM `directory` module

Use OM organizations as the base. Add a `dealer_profiles` table that FK-references `organizations.id`. Use OM's RBAC to define `dealer:owner` and `dealer:staff` roles with a custom permission set.

- **Pros:** Reuses OM's auth, user management, and multi-tenancy for free.
- **Cons:** Depends on OM's organization model being flexible enough — unknown until spiked.
- **Risk:** If OM does not support custom org types or role scoping at the dealer level, this option breaks down.

### Option B — Custom `dealer` module (standalone)

Build a `dealer` module with its own organization concept. Dealer users are still OM users (for auth), but their org model is entirely custom.

- **Pros:** Full control, no dependency on OM internals.
- **Cons:** Duplicates work OM already does (user management, invites, RBAC); more code to maintain.
- **Risk:** Higher upfront effort; may conflict with OM internals over user-to-org relationships.

## Required Spike

Before Phase 2 implementation begins, run a spike (estimated: 1 day) to answer:

1. Can an OM organization have a custom `type` field, and can the API be scoped to organizations of a specific type?
2. Does OM support defining custom roles (e.g. `dealer:owner`) with custom permission sets, or only its built-in roles?
3. Can a dealer user be restricted to seeing only their own organization's data via OM's RBAC without custom middleware?
4. Does the `directory` module expose the APIs needed by FEAT-008/FEAT-009, or would we be calling internal OM methods?

## Decision

*(Pending spike.)*

Hypothesis: **Option A** is viable. OM 0.8.0 supports custom organization types and extensible RBAC, so dealer orgs can be layered on top. Custom `dealer_profiles`, `dealer_capabilities`, and `dealer_kyc_documents` tables extend the OM org without touching core.

If the spike finds Option A is not viable, fall back to Option B with a clear boundary: dealer users authenticate via OM, but everything else is custom.
