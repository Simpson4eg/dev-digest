# server/ setup

## First boot

```sh
pnpm install
pnpm db:migrate     # NOT auto on boot — pgvector enabled by migration 0000
pnpm db:seed        # idempotent demo data: acme/payments-api, PR #482, agents
pnpm dev            # tsx watch on :3001
```

The whole-repo bootstrap (`./scripts/dev.sh` from repo root) does all of the
above plus the web client.

## Environment

Copy `.env.example` to `.env`. Defaults are tuned for local dev.

| Var                          | Default                                                       | Notes                                                                 |
|------------------------------|---------------------------------------------------------------|-----------------------------------------------------------------------|
| `DATABASE_URL`               | `postgres://devdigest:devdigest@localhost:5432/devdigest`     | required to migrate/serve                                             |
| `API_PORT`                   | `3001`                                                        | Fastify listen port                                                   |
| `WEB_PORT`                   | `3000`                                                        | also sets the allowed CORS origin                                     |
| `OPENAI_API_KEY`             | —                                                             | optional; also settable via Settings UI                               |
| `ANTHROPIC_API_KEY`          | —                                                             | optional                                                              |
| `OPENROUTER_API_KEY`         | —                                                             | optional                                                              |
| `GITHUB_TOKEN`               | —                                                             | optional; PAT with repo scope (`GITHUB_PAT` accepted as fallback)     |
| `EMBEDDINGS_ENABLED`         | `false`                                                       | OpenAI embeddings for memory/RAG; `false` → zero OpenAI calls         |
| `REPO_INTEL_ENABLED`         | `true`                                                        | enrich prompt with repo skeleton + callers; `false` → ripgrep-only    |
| `DEVDIGEST_CLONE_DIR`        | `./clones`                                                    | imported-repo checkouts (git-ignored)                                 |
| `LOG_LEVEL`                  | `info` (`silent` in test)                                     | pino level; empty string is accepted as default                       |
| `NODE_ENV`                   | `development`                                                 | `test` → silent logs + global rate-limit disabled                     |

## Secrets

Secrets are **not** part of `AppConfig`. They go through `SecretsProvider`:

1. `~/.devdigest/secrets.json` (created when you enter a key in Settings, mode
   `0600`)
2. `process.env` fallback

Read chokepoint: `src/adapters/secrets/local.ts` (`LocalSecretsProvider`).
Secrets never land in git or the database.

## Healthchecks

- `GET /health` — liveness (always 200)
- `GET /health/ready` — DB ping, 200 if reachable else 503

## See also

- `CLAUDE.md` — repo conventions for this package
- `specs/db-schema.md` — schema layout + migration discipline
- `../docs/agent-prompts/README.md` — how reviewer system prompts are written
