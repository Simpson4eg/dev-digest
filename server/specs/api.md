# API endpoint map

Routes are owned by `src/modules/<feature>/routes.ts`. Schemas come from Zod
contracts in `src/vendor/shared/contracts/`, wired through
`fastify-type-provider-zod`.

## Endpoints (starter)

| Domain      | Method | Path                                   | Notes                          |
|-------------|--------|----------------------------------------|--------------------------------|
| repos       | GET    | `/repos`                               | list workspace repos           |
|             | POST   | `/repos`                               | add a repo                     |
| pulls       | GET    | `/repos/:id/pulls`                     | PR list                        |
|             | GET    | `/pulls/:id`                           | PR detail                      |
|             | GET    | `/pulls/:id/comments`                  | PR comments                    |
| polling     | POST   | `/repos/:id/poll`                      | force a poll cycle             |
| reviews     | POST   | `/pulls/:id/review`                    | trigger a review run (rate-limited tighter) |
|             | GET    | `/reviews`                             | recent reviews                 |
|             | POST   | `/findings/:id/accept`                 |                                |
|             | POST   | `/findings/:id/dismiss`                |                                |
|             | GET    | `/runs/:id`                            | single run status (workspace-scoped; 404 if unknown) |
|             | GET    | `/runs/:id/events`                     | SSE — live run trace           |
|             | GET    | `/runs/:id/trace`                      | persisted run trace            |
| agents      | GET    | `/agents`                              |                                |
|             | GET    | `/agents/:id`                          |                                |
| repo-intel  | GET    | `/repos/:id/index-state`               |                                |
|             | POST   | `/repos/:id/resync`                    |                                |
| settings    | GET/PUT| `/settings`                            | workspace settings             |
|             | GET    | `/providers`                           | available LLM providers        |
| workspace   | GET    | `/workspace`                           |                                |
| health      | GET    | `/health`                              | liveness                       |
|             | GET    | `/health/ready`                        | DB ping → 200/503              |

## Cross-cutting

- **CORS** — origin = `http://localhost:${WEB_PORT}` (default `:3000`).
- **Rate limit** — global 120/min (disabled under `NODE_ENV=test`). SSE and
  `/health*` are exempt. `POST /pulls/:id/review` has a tighter per-route cap.
- **Error envelope** — see `src/platform/errors.ts`. Validation errors → 422;
  `AppError` subclasses map to their declared HTTP status; serialization errors
  → 500.

## See also

- `specs/contracts.md` — schemas referenced by each route
- `CLAUDE.md` — schema-first convention
- `docs/review-pipeline.md` — what `POST /pulls/:id/review` does internally
