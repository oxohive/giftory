# Spec-Driven Development

All feature work in Giftory is spec-first. A spec file is the single source of truth for a feature — it defines the problem, requirements, data model, API contract, and acceptance criteria **before** implementation begins.

## Folder Layout

```
spec/
├── README.md               # This file
├── phase-2/
│   ├── index.md            # Phase scope, goals, and feature index
│   ├── features/           # One file per feature (FEAT-XXX)
│   └── stories/            # User stories scoped to this phase (US-XXX)
├── phase-3/                # Added when Phase 2 nears completion
└── decisions/              # Architecture Decision Records (ADR-XXX)
```

Phase 1 feature specs live in [`docs/features/`](../docs/features/) and are kept there as the historical record of what was built.

## Spec Lifecycle

| Status | Meaning |
|---|---|
| `Draft` | Being written; not ready for implementation |
| `Ready` | Spec is complete; implementation may begin |
| `In Progress` | Implementation underway |
| `Implemented` | Done; spec is now the verified reference |
| `Superseded` | Replaced by a newer spec; see note in the file |

## Writing a Feature Spec

1. Create `spec/phase-N/features/FEAT-XXX-short-name.md`.
2. Fill in all sections: Objective, Scope, Requirements, Data Model, API Contract, Dependencies.
3. Set status to `Draft` until all sections are complete and the team has reviewed it.
4. Set status to `Ready` before picking it up for implementation.
5. Keep the spec updated as decisions are made during implementation — it is a living document.

## Writing a User Story

1. Create `spec/phase-N/stories/US-XXX-short-name.md`.
2. Link it to one or more feature specs.
3. User stories contain acceptance criteria. Feature specs contain the full technical contract.

## Architecture Decision Records

`spec/decisions/ADR-XXX-title.md` — one per architectural decision. Each ADR records the decision, why it was made, and the alternatives considered. ADRs are immutable once accepted; supersede by creating a new ADR.
