# INSIGHTS — server

Non-obvious engineering findings accumulated session by session. Append-only;
git-versioned; a draft under human review, not canonical truth.

Entry format:

```
- YYYY-MM-DD · <one-line gist> · evidence: `path/to/file.ts:42`
  <1–3 lines explaining why this matters and when it applies; actionable "cold">
```

Quality bar: if a reader of the code could derive this themselves, don't write
it. See `.claude/skills/capturing-insights/examples.md` for bad/good pairs.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-06-20 · `multi_agent_runs` exists but has NO FK from `agent_runs` — group party runs by `ran_at` time window (60s), not by id.
  evidence: `server/src/db/schema/runs.ts:8-50`
  The `agent_runs` table has no `multi_agent_run_id` column; the relationship is implicit (created within ~seconds of each other under the same `pr_id`). Code that needs to roll up "the latest party" (e.g. PR-detail cost+tokens) sorts completed runs by `ran_at DESC`, takes the newest timestamp, then includes everything within ±60s of it. See `lastPartyStats` in `server/src/modules/pulls/routes.ts`. Do NOT assume a FK exists.

- 2026-06-20 · New fields on `RunSummary` (Zod contract returned by repo) MUST be `.nullable().optional()`, not just `.nullable()` — repo layer can't fill them, service layer enriches.
  evidence: `server/src/vendor/shared/contracts/trace.ts:94-114` + `server/src/modules/reviews/repository/run.repo.ts:51`
  The repo returns `RunSummary[]` typed from the schema; if a field is required (even nullable), TS fails compilation because repo doesn't set it. Service `listRuns()` wraps the repo output and adds derived fields (cost_usd from PriceBook). Pattern: derived/enriched fields go `.nullable().optional()`; the service layer overwrites the optional.

## Tool & Library Notes

- 2026-06-20 · Vendored shared contracts (`client/src/vendor/shared/contracts/`) are NOT synced by any script — edits to `server/src/vendor/shared/contracts/` require manual `cp` to the client copy.
  evidence: `server/CLAUDE.md` do-not-touch + `client/src/vendor/shared/contracts/{trace,platform}.ts`
  There is no `pnpm sync-shared` or similar. After editing a Zod schema on the server, `cp server/src/vendor/shared/contracts/<file>.ts client/src/vendor/shared/contracts/<file>.ts`. Otherwise client compiles against a stale shape and runtime parse silently strips your new field (per `fastify-type-provider-zod` serializer behavior). Same applies for any new file added to the contracts folder.

## Recurring Errors & Fixes

- 2026-06-19 · `writeFileAt` test helper uses `lastIndexOf('/')` and silently
  skips `mkdir` on Windows, causing 6 ENOENT failures in
  `runIncremental → diff failure` paths.
  evidence: `server/test/indexer-pipeline.test.ts:142`
  `path.join` on Windows returns backslash-separated paths, so the helper's
  `'/'.lastIndexOf` returns `-1`, the guard `if (slash > 0)` is false, and
  `writeFile(full, ...)` then fails because the directory wasn't created. Tests
  pass on Linux CI but fail locally on Windows. Fix when next touching: use
  `path.dirname(full)` for the mkdir target instead of slicing on a hardcoded
  separator. Do NOT block doc-only commits on these failures.

## Session Notes

## Open Questions
