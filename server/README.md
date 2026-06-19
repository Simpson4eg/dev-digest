# `@devdigest/api` — the engine (Fastify + Postgres)

The DevDigest backend. Imports repos and pull requests, indexes them with
`repo-intel`, stores agents, and runs the reviewer (diff → `reviewer-core` →
grounded structured findings).

**Stack:** Fastify 5, Drizzle ORM, Postgres + pgvector. Adapters (LLM, GitHub,
git, ast-grep, …) sit behind a DI container so they swap for mocks in tests.

> This is the **starter** module set. Later course lessons add their own modules
> (skills, intent/smart-diff, blast, brief/context/onboarding, eval/ci/hooks,
> memory, plugins, …). The DB schema already contains every table; the unused
> ones simply sit empty until a lesson fills them.

## Quick start

```sh
pnpm install
pnpm db:migrate     # not auto on boot
pnpm db:seed        # idempotent demo data
pnpm dev            # :3001
```

From the repo root, `./scripts/dev.sh` does all of the above plus the web client.

**No keys required to boot.** Every secret is optional and can be set later via
the Settings UI.

## Tests

- `pnpm test` — everything
- `pnpm exec vitest run --exclude '**/*.it.test.ts'` — unit, no Docker
- `pnpm exec vitest run .it.test` — integration (testcontainers Postgres)

See [`../TESTING.md`](../TESTING.md) for the suite split.

## Where to look

- **For agents / contributors** the map is [`CLAUDE.md`](./CLAUDE.md) (stack,
  layout, conventions, gotchas, do-not-touch).
- **How-to** lives in [`docs/`](./docs/):
  - [`setup.md`](./docs/setup.md) — env vars + secrets
  - [`adding-a-module.md`](./docs/adding-a-module.md) — feature module template
  - [`review-pipeline.md`](./docs/review-pipeline.md) — review flow internals
  - [`adapters.md`](./docs/adapters.md) — adding an adapter
- **Contracts** in [`specs/`](./specs/):
  - [`contracts.md`](./specs/contracts.md) — Zod contract index
  - [`db-schema.md`](./specs/db-schema.md) — Drizzle schema + migration discipline
  - [`api.md`](./specs/api.md) — endpoint map

Cross-package reviewer prompts live in [`../docs/agent-prompts/`](../docs/agent-prompts/).
