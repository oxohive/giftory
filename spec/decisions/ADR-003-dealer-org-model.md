# ADR-003: Dealer Organization Model — OM `directory` vs Custom Module

- **Status:** Accepted
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

### Option A — Extend OM `directory` module ✅ Chosen

Use OM organizations as the base. Add a `dealer_profiles` table that FK-references `organizations.id`. Use OM's RBAC to define `dealer:owner` and `dealer:staff` roles with a custom permission set.

- **Pros:** Reuses OM's auth, user management, and multi-tenancy for free.
- **Cons:** No built-in `type` field on organizations — but `dealer_profiles` FK acts as the type discriminator.
- **Risk:** Mitigated — spike findings confirm all required capabilities exist.

### Option B — Custom `dealer` module (standalone)

Build a `dealer` module with its own organization concept. Dealer users are still OM users (for auth), but their org model is entirely custom.

- **Pros:** Full control, no dependency on OM internals.
- **Cons:** Duplicates work OM already does (user management, invites, RBAC); more code to maintain.
- **Risk:** Higher upfront effort; may conflict with OM internals over user-to-org relationships.

## Spike Findings (2026-10-10)

The spike was conducted by inspecting the compiled OM 0.8.0 source (`@open-mercato/core`). All four questions are resolved:

1. **Custom org `type` field** — No built-in field exists. Not needed: the presence of a `dealer_profiles` row linked via `organization_id` is the type discriminator. Any org with a `dealer_profiles` row is a dealer org.

2. **Custom roles** — Fully supported. `auth.roles.create` accepts any role name except the reserved `"superadmin"` and `"admin"`. Roles `dealer:owner` and `dealer:staff` can be created and seeded with custom ACL features via `setup.defaultRoleFeatures` in the app module setup.

3. **Org-scoped role restriction** — First-class feature via `role_acls.organizations_json`. Setting this to `["<dealer-org-id>"]` means the role's permissions fire only when the request is scoped to that organization. Dealer users are structurally prevented from accessing other dealers' data — no custom middleware required.

4. **Directory/auth API coverage** — `POST /api/directory/organizations` creates the org; `POST /api/users` creates the dealer user with `organizationId`; `PUT /api/roles/acl` sets the scoped ACL. All FEAT-008/009 operations are covered by existing APIs.

## Decision

**Option A — Accepted.**

Dealer organizations are OM organizations. The `dealer_profiles` table links to `organizations.id` and carries all dealer-specific data (KYC status, GSTIN, business type, etc.). Dealer users are OM users with `organization_id` pointing to their dealer org.

Custom roles `dealer:owner` and `dealer:staff` are created via `auth.roles.create` during app setup. Their `role_acls.organizations_json` is set to the specific dealer org ID at onboarding time, scoping all dealer permissions to their own organization only.

### Implementation pattern

```
OM organizations (directory module)
    ↑ FK: organization_id
dealer_profiles (app module: gift_catalog or new dealer module)
    ↑ FK: dealer_profile_id
dealer_kyc_documents (app module)
dealer_capabilities (app module, FEAT-009)

OM roles: "dealer:owner", "dealer:staff"
    → role_acls.organizations_json = [dealer-org-id]  ← scoped at onboarding
OM users: users.organization_id = dealer-org-id
```

Option B is rejected — it would duplicate user management, invites, session handling, and RBAC that OM already provides correctly.
