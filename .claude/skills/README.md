# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Onion/hexagonal layering: inward dependency rule, ports & adapters, where backend code belongs (Node.js + TypeScript) |
| [frontend-architecture](frontend-architecture/SKILL.md) | Frontend | UI architecture & code organization: folder structure, decomposition, where code lives (React + Next.js App Router) |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [backend-testing](backend-testing/SKILL.md) | Backend | Vitest for `server/`/`reviewer-core/`: hermetic mocks, `app.inject()`, `.it.test.ts` + testcontainers, test-quality rules |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [pr-self-review](pr-self-review/SKILL.md) | Workflow | Local pre-PR review gate: routes changed files to the matching skills (UI → frontend, backend → onion/fastify/drizzle), blocks `gh pr create`/`git push` on any CRITICAL |
| [skill-routing](skill-routing/SKILL.md) | Workflow | Canonical path→skill mapping — the single source of truth shared by the planner, implementer, test-writer, reviewers, and the PR gate |
| [spec-authoring](spec-authoring/SKILL.md) | Workflow | Requirements-engineering craft: EARS acceptance criteria, INVEST user stories, edge-case & non-functional checklists (used by spec-creator) |
| [workflow-retro](workflow-retro/SKILL.md) | Workflow | Manual post-run retrospective of a multi-agent SDD run: tokens/cache/tool-calls/parallelism (incl. nested subagents), insights → tuning actions, trend line in `docs/retros/ledger.md` |

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
