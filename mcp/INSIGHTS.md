# mcp/ — INSIGHTS

Non-obvious findings for `@devdigest/mcp`. Each entry: what + evidence + date.

## run_agent_on_pr wait must stay under the MCP client's tool-call timeout (2026-07-07)

The "result, not operation" tool waits for the review to finish, but an MCP
client (Claude Code / Desktop) enforces its own tool-call timeout (~60s). If our
internal wait is longer, the client hard-aborts the call **before** the graceful
`{status:'running', run_id}` fallback can return — defeating the fallback.

- `DEVDIGEST_RUN_TIMEOUT_MS` defaults to **50s** (not 90s) for exactly this
  reason — `src/config.ts` `loadConfig`, consumed in `src/tools/run-agent-on-pr.ts`.
- The API trigger is fire-and-forget (`server/src/modules/reviews/service.ts:141-147`),
  so runs always outlive a single tool call on large PRs — the fallback is the
  normal path there, not an error.

## Port types are mirrored from @devdigest/shared by hand (2026-07-07)

`src/api/port.ts` re-declares the response shapes (Agent/Repo/Review/RunSummary/
Convention) instead of importing `@devdigest/shared`, to keep this external client
self-contained (typechecks/tests with no cross-package build wiring). Trade-off:
if the shared contracts drift, `port.ts` must be updated manually — it is not
compiler-linked to the source of truth.
