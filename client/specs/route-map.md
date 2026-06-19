# Route map

Pages in `src/app/` and the API surface each leans on (via `src/lib/hooks/*` →
`src/lib/api.ts`).

| Route                         | Purpose                       | Hooks → API endpoints                                                                                              |
|-------------------------------|-------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `/`                           | redirect to first repo's PR list | `useRepos` → `GET /repos`                                                                                          |
| `/onboarding`                 | add-repo form                 | `POST /repos`                                                                                                       |
| `/repos/:repoId/pulls`        | PR list                       | `GET /repos/:id/pulls`, `GET /repos/:id/index-state`                                                                |
| `/pulls/:number`              | review detail (overview / diff / findings tabs) | `GET /pulls/:id`, `GET /reviews`, `GET /pulls/:id/comments`, `POST /pulls/:id/review`, `POST /findings/:id/(accept|dismiss)` |
| `/agents`                     | agents list                   | `GET /agents`                                                                                                       |
| `/agents/:id`                 | agent editor                  | `GET/PUT /agents/:id`                                                                                               |
| `/settings/:section`          | API keys / models             | `GET/PUT /settings`, `GET /providers`                                                                               |

Cross-cutting chrome (nav, breadcrumbs, `g`-then-key shortcuts) lives in
`src/components/app-shell` and is mounted by the root layout.

## SSE streams

`/pulls/:number` subscribes to `GET /runs/:id/events` (Server-Sent Events) for a
live run trace while a review is executing. The hook is one-shot per run id.

## See also

- `specs/api-consumption.md` — how schemas are wired into the call
- `../server/specs/api.md` — server-side endpoint map (authoritative)
- `docs/routing.md` — App Router conventions
