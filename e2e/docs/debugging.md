# Debugging a flow

When a flow fails, the runner exits non-zero and dumps a screenshot to
`e2e/test-results/` (git-ignored; uploaded as a CI artifact by
`.github/workflows/e2e-web.yml`).

## Triage order

1. **Read the failing step label** — `run.ts` prints it before exit.
2. **Open the screenshot** at `e2e/test-results/`. The browser was paused at the
   failing assertion; the screenshot shows what the page actually contained.
3. **Check the precondition** — `02 / 04 / 05` assume the seeded demo repo is
   the *only* repo. If your dev DB has others, these flows land on the wrong
   repo and fail with "text not found".
4. **Check ports** — flows hit `E2E_BASE_URL` (default `http://localhost:3000`).
   The hermetic runner uses alternate ports (web `:3100`, API `:3101`, Postgres
   `:5433`) — don't mix.

## Running one flow

`run.ts` runs every `specs/*.flow.json` in lexical order. To iterate on a
single flow, either:

- Temporarily rename others out of `specs/` (don't commit).
- Or extend `run.ts` with a CLI filter (none today).

## Running against a custom URL

```sh
E2E_BASE_URL=http://localhost:3100 npm test
```

Combine with `AGENT_BROWSER_BIN` (default `agent-browser`) and
`E2E_STEP_TIMEOUT` (ms, default 60000).

## Hermetic stack envs

`./scripts/e2e.sh` consults:

- `E2E_PG_PORT` (default 5433)
- `E2E_API_PORT` (default 3101)
- `E2E_WEB_PORT` (default 3100)
- `E2E_PG_CONTAINER` (default `devdigest-e2e-postgres`)
- `E2E_PG_IMAGE` (default `pgvector/pgvector:pg16`)

## Common failures

| Symptom                          | Likely cause                                          |
|----------------------------------|-------------------------------------------------------|
| `wait --text` times out          | DB not freshly seeded, OR running flow against wrong port |
| `wait --url` times out           | A redirect or route changed; flow assumption stale    |
| Screenshot shows "repo not found" | Dev DB has the seeded repo but at a different slug   |
| Chrome won't launch              | Run `agent-browser install` again                     |

## See also

- `docs/writing-flows.md` — flow shape and rules
- `CLAUDE.md` — precondition + `docker compose down -v` warning
