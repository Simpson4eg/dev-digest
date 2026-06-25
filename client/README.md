# `@devdigest/web` — the studio (Next.js 15)

The DevDigest UI: import repos, browse pull requests, run and read AI reviews,
and author agents. App Router + React Server/Client components, data via
**TanStack Query** hooks over the Fastify API.

**Stack:** Next.js 15, React 19, TanStack Query, `next-intl`, `recharts`,
`mermaid`, `react-markdown`. UI primitives vendored at `src/vendor/ui`; Zod
contracts vendored at `src/vendor/shared` (read-only copy of the server's).

## Quick start

```sh
pnpm install
pnpm dev          # :3000
```

`NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) points at the API.

`pnpm test` (vitest + jsdom, fetch mocked — no API or browser needed) ·
`pnpm typecheck` · `pnpm build`.

## Where to look

- **For agents / contributors:** [`CLAUDE.md`](./CLAUDE.md) (stack, layout,
  conventions, gotchas, do-not-touch).
- **How-to** in [`docs/`](./docs/):
  - [`setup.md`](./docs/setup.md) — env + API base URL
  - [`state-management.md`](./docs/state-management.md) — TanStack Query patterns
  - [`i18n.md`](./docs/i18n.md) — next-intl conventions
  - [`routing.md`](./docs/routing.md) — App Router + `_components/`
- **Contracts** in [`specs/`](./specs/):
  - [`api-consumption.md`](./specs/api-consumption.md) — wiring Zod into requests
  - [`route-map.md`](./specs/route-map.md) — routes ↔ endpoints

Browser journeys are covered by [`../e2e`](../e2e/README.md). See
[`../TESTING.md`](../TESTING.md) for the suite split.
