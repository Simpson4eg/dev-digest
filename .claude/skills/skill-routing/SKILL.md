---
name: skill-routing
description: Canonical path→skill routing table for DevDigest. Use whenever an agent or gate
  must decide which project skills govern a changed file — planning tasks (implementation-planner),
  writing code (implementer), writing tests (test-writer), or reviewing (architecture-reviewer,
  plan-verifier, pr-self-review). This is the single source of truth for the mapping — reference
  it by name; never copy the table into another file, or the copies will drift.
---

# skill-routing — which skills govern which files

Classify each changed file by its path, then apply the mapped skills. Every consumer of this
mapping (planner, implementer, test-writer, the reviewers, and the `pr-self-review` gate) uses
**this one table** so a task is planned, implemented, tested, and reviewed against the same
rules.

## Drop first — never routed

Generated / vendored / non-code paths are excluded from review and skill-loading:
`**/migrations/**`, `*/vendor/shared/**` (review the **source of truth** under
`server/src/vendor/shared/` only, never the `client/` copy), lockfiles, and non-code assets.

## The table

| Group | Path glob | Skills to apply |
|---|---|---|
| **UI** | `client/src/**/*.{ts,tsx}` (not `*.test.tsx`) | frontend-architecture, react-best-practices, next-best-practices, typescript-expert, security, zod |
| **UI tests** | `client/src/**/*.test.tsx`, `client/src/test/**` | + react-testing-library |
| **Backend** | `server/src/**/*.ts` | onion-architecture, fastify-best-practices, typescript-expert, security, zod |
| **Backend tests** | `server/**/*.test.ts`, `server/**/*.it.test.ts`, `reviewer-core/**/*.test.ts` | + backend-testing |
| **DB schema** | `server/src/db/schema/**/*.ts`, repository adapters | + drizzle-orm-patterns, postgresql-table-design |
| **Pure engine** | `reviewer-core/src/**/*.ts` | onion-architecture (purity / inward-dependency rule), typescript-expert, security, zod |
| **Shared contracts** | `server/src/vendor/shared/**/*.ts` | zod, typescript-expert |

## Cross-cutting — every code group

`security`, `zod`, and `typescript-expert` apply to **every** code file, backend or UI.

## Not a code/review skill

`mermaid-diagram` and `spec-authoring` are **planning/spec** skills — never loaded to write or
review code. `capturing-insights` is a wrap-up skill, not a routing target.
