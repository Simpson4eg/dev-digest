# Eval 01 — code edit triggers a write

Tests that the skill fires when it should: a real code change in one of the
four packages.

## Scenario

User: "Add a `requestId` field to every Fastify request log line. Pipe it
through the response envelope so the client can echo it back in support
tickets."

Files touched: `server/src/platform/logger.ts`, `server/src/app.ts`,
`server/src/vendor/shared/contracts/observability.ts`. ~45 minutes.

## Expected behavior

1. **Checkpoint 1 fires.** Agent reads `server/INSIGHTS.md` and confirms in
   one user-facing line, including top-3 most relevant entries (or "0
   relevant; first run for this concern").
2. **Code change happens.** Out of scope for this skill.
3. **Checkpoint 3 fires at wrap-up.** Agent identifies a non-obvious finding,
   for example:
   - `pino`'s `mixin()` runs **per log line** — if the requestId resolver
     hits a Map lookup, that's hot-path cost; cache the id on the request
     object instead.
   - `fastify-type-provider-zod` strips unknown response keys silently, so
     `requestId` MUST be in the Zod response contract or it vanishes.
4. **Checkpoint 2 fires before write.** Agent re-reads
   `server/INSIGHTS.md → ## Tool & Library Notes`; finds no overlap; writes.
5. **Entry format is correct.** `YYYY-MM-DD · gist · evidence: file:line`
   plus 1–3 lines of "why".

## Failure modes to catch

- Agent writes nothing because "the work was straightforward" → false negative
  on the signal check; the pino `mixin` cost is exactly the kind of finding
  this skill exists for.
- Agent writes a session summary ("Added requestId to logger") → wrong content
  type; that belongs in the PR description.
- Agent omits the `file:line` evidence → entry MUST be rejected by the quality
  bar.
