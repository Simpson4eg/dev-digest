# client/ setup

## First boot

```sh
pnpm install
pnpm dev          # :3000
```

The whole-repo bootstrap (`./scripts/dev.sh` from repo root) installs and runs
both client and server.

## Environment

Copy `.env.example` to `.env` (or `.env.local` for personal overrides).

| Var                    | Default                  | Notes                                              |
|------------------------|--------------------------|----------------------------------------------------|
| `NEXT_PUBLIC_API_BASE` | `http://localhost:3001`  | Fastify API base URL; consumed by `src/lib/api.ts` |
| `NEXT_PUBLIC_*`        | —                        | Anything exposed to the browser MUST be `NEXT_PUBLIC_` prefixed |

CORS on the server is keyed to the web port (default `:3000`). If you change the
web port, also set `WEB_PORT` for the server, otherwise requests are rejected.

## Build

```sh
pnpm build        # Next.js production build
pnpm start        # serve the build
```

CI checks `pnpm typecheck && pnpm test && pnpm build`.

## Tests

`pnpm test` — vitest + jsdom. `fetch` is mocked globally via
`src/test/setup.ts`; tests don't need the API or a real browser. The browser
journey suite is in `../e2e`.

## See also

- `CLAUDE.md` — package conventions
- `docs/state-management.md` — TanStack Query patterns
