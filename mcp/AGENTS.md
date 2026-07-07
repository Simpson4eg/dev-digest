# mcp/ — `@devdigest/mcp` (local stdio MCP server)

A thin **Model Context Protocol** server that exposes 5 DevDigest review tools to
an MCP client (Claude Code / Desktop). It is a **client over the Fastify API**
(`@devdigest/api`, `:3001`) — no DB, no domain logic of its own.

## Run / verify

Uses **npm** (like `e2e/` and `reviewer-core/`), not pnpm.

| What      | Command             |
|-----------|---------------------|
| dev       | `npm run dev` (tsx) |
| build     | `npm run build` → `dist/` |
| typecheck | `npm run typecheck` |
| test      | `npm test` (Vitest; mocks the port, never `fetch`) |

Needs the DevDigest API running (`./scripts/dev.sh`). Config via env — see
`.env.example` (`DEVDIGEST_API_URL`, `DEVDIGEST_RUN_TIMEOUT_MS`, …).

## The 5 tools

| Tool | Kind | Backend calls |
|------|------|---------------|
| `list_agents` | read | `GET /agents` |
| `run_agent_on_pr` | **write** (only one) | resolve → `POST /pulls/:id/review` → poll `GET /runs/:id` → `GET /pulls/:id/reviews` |
| `get_findings` | read | `GET /pulls/:id/reviews` (+ `GET /pulls/:id/runs`) |
| `get_conventions` | read | `GET /repos/:id/conventions` |
| `get_blast_radius` | read | **stub** — returns `isError` (homework) |

## Layout (onion, dependencies point inward)

| Ring | Files | Rule |
|------|-------|------|
| 1 Domain/Port | `api/port.ts` | `DevDigestApi` interface + response types. No transport. |
| 2 Application | `app/resolve.ts`, `app/shaping.ts`, `app/tool-error.ts` | Depend on the port only; pure/no `fetch`. |
| 3 Infrastructure | `api/http-client.ts`, `api/errors.ts` | The **only** `DevDigestApi` impl. |
| 4 Presentation | `tools/*`, `tools/respond.ts` | Validate input → call the **injected port** → serialize. |
| Composition Root | `server.ts` | The **only** place that does `new HttpDevDigestApi`. |

Tools receive the port via injection (`ToolCtx`) — never `new` the client
inside a tool. Tests inject a mock `DevDigestApi`.

## Design rules baked into every tool

- **Result, not operation** — `run_agent_on_pr` triggers + waits + returns findings.
- **Flat args** — `repo` (`"owner/name"`), `pr` (number), `agent` (id). No nested objects.
- **Concise, summary-first** — severity breakdown by default; full list only on `detail:true` (paginated).
- **Error leads forward** — failures return an actionable next step (e.g. "call list_agents"), via `isError`.
- Tight descriptions (<150 tokens). No tool-search (only 5 tools).

## Non-obvious

- **Local response types.** `api/port.ts` mirrors `@devdigest/shared` contracts
  **by hand** instead of importing them, so this external client stays
  self-contained (typechecks/tests with no cross-package build) and doesn't break
  on unrelated server-internal type shifts. If contracts drift, update `port.ts`.
- **run↔review has no FK** — `get_findings` keys by (repo, pr, agent?) via
  `reviewsForPull`, not by run id.
- **Timeout must be < the client's tool-call timeout** — `DEVDIGEST_RUN_TIMEOUT_MS`
  defaults to 50s so the graceful `{status:'running'}` fallback returns before an
  MCP client (~60s) aborts the call.
- No auth header today (API is local-no-auth); `DEVDIGEST_API_TOKEN` is a seam.
