# client/ — `@devdigest/web` (Next.js 15 + React 19)

Web studio. App Router + RSC/Client components. Data via **TanStack Query** hooks
over the Fastify API; no direct DB access.

## Run / verify

| What       | Command                                |
|------------|----------------------------------------|
| dev        | `pnpm dev` (`:3000`)                   |
| typecheck  | `pnpm typecheck`                       |
| test       | `pnpm test` (vitest + jsdom, fetch mocked) |
| build      | `pnpm build`                           |

No API or browser needed for tests — `fetch` is mocked and components render in
jsdom.

## Layout (`src/`)

| dir              | what                                                       |
|------------------|------------------------------------------------------------|
| `app/`           | App Router pages (`page.tsx`, `layout.tsx`, route groups)  |
| `app/.../_components/` | route-private feature components, each in own folder with `*.test.tsx` |
| `components/`    | cross-route chrome: `app-shell`, `diff-viewer`, `mermaid-diagram`, `page-shell`, `repo-not-found`, `showcase` |
| `lib/api.ts`     | typed `fetch` wrapper (consumes Zod contracts)             |
| `lib/hooks/`     | TanStack Query hooks — one per resource (`useRepos`, …)    |
| `lib/providers/` | React providers (QueryClient, theme, intl)                 |
| `lib/`           | misc utils: `theme`, `toast`, `types`, `feature-models`, `github-urls` |
| `i18n/`          | `next-intl` config; messages in `messages/<locale>/*.json` |
| `test/`          | jsdom helpers, fixtures                                    |
| `vendor/shared/` | **vendored copy** of Zod contracts (read-only)             |
| `vendor/ui/`     | vendored UI primitives (`@devdigest/ui`)                   |

## Non-default conventions

- Path alias `@/*` → `client/src/*` (defined in `tsconfig.json`).
- Component folders are `PascalCase`: `FindingsTab/FindingsTab.tsx` plus
  `FindingsTab.test.tsx` beside it.
- Hooks named `useXxx`, one query per file, return TanStack Query results
  directly (no extra wrapper layer).
- Route-private components live in `_components/` (Next.js underscore prefix
  excludes them from routing).
- Pages are thin — feature logic sits in colocated `_components/`.
- Cross-route chrome (nav, breadcrumbs, `g`-then-key shortcuts) is in
  `src/components/app-shell`.

## Gotchas

- **`src/vendor/shared/` is a vendored copy.** Don't edit it here — the source
  of truth is `server/src/vendor/shared/`. Edits get overwritten.
- **`NEXT_PUBLIC_API_BASE`** defaults to `http://localhost:3001`. CORS on the
  server matches `WEB_PORT` (default `3000`); changing the web port without
  updating the server's CORS will break requests.
- **TanStack Query keys** must include any input that affects the response
  (workspace id, filters). Stale keys are the #1 source of "why isn't this
  updating" bugs.
- Server Components vs Client Components: hooks (`useState`, `useQuery`, …) only
  work in client components (`'use client'` directive). Default to server
  components unless you need interactivity.

## Do-not-touch

- `src/vendor/shared/` — copy, not source. Update `server/src/vendor/shared/`
  and the vendor sync brings changes here.
- `src/vendor/ui/` — vendored UI primitives. Treat like a third-party package.

## See also

- `README.md` — onboarding
- `docs/setup.md` — env + API base URL
- `docs/state-management.md` — TanStack Query conventions
- `docs/i18n.md` — next-intl: keys, fallback, додавання локалі
- `docs/routing.md` — App Router conventions + `_components/` pattern
- `specs/api-consumption.md` — як споживаються Zod-контракти з vendored shared
- `specs/route-map.md` — таблиця маршрутів і endpoints
- `INSIGHTS.md` — non-obvious знахідки з file:line (накопичується skill'ом)
- `../AGENTS.md` — глобальна карта репо
