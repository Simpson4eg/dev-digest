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

- 2026-07-04 · In `reviews.it.test.ts` the intent pre-work is silently skipped unless you point `review_intent` at a MOCKED provider — its registry default is `openrouter`, which the tests don't override · evidence: `server/test/reviews.it.test.ts` (Intent Layer test) + `server/src/modules/reviews/run-executor.ts` `deriveIntent`
  `deriveIntent` is best-effort: `container.llm('openrouter')` throws (no key in test) → intent is caught + skipped → `pr_intent` stays empty. To actually exercise it, `PUT /settings` with `feature_models.review_intent = { provider: 'openai', model: 'gpt-4.1' }` AND feed the mock a `structuredBySchema: { Intent: <fixture>, Review: <fixture> }` (MockLLMProvider validates the fixture against the passed schema, so the Intent fixture must match the `Intent` shape, not `Review`). Otherwise you'll wrongly conclude the wiring is broken.

## Codebase Patterns

- 2026-07-04 · The Intent Layer was fully scaffolded but DEAD until wired in run-executor — `pr_intent` table, `upsertIntent`/`getIntent`, the `review_intent` registry entry, and the `Intent`/`PrIntentRecord` contracts all pre-existed with NO code path generating or serving intent · evidence: `server/src/modules/reviews/run-executor.ts:62-70` (comment said "Loads the diff + intent once" but only the diff was loaded)
  Pattern for such "half-built feature" registry entries (e.g. `risk_brief`, `conformance` in `FEATURE_MODELS`): the contract + table + repo methods may already exist — grep for them before adding new ones. Wiring point is `executeRuns` shared pre-work: `resolveFeatureModel(container, workspaceId, <feature>)` → `container.llm(provider)` → the pure pass → persist. Keep it best-effort (try/catch → `runLog.info('… skipped')`), OUTSIDE `failAll`, so enrichment never fails the review.

- 2026-06-29 · `agent_skills` has no `workspace_id`; tenant safety must be enforced before writes and through joined reads · evidence: `server/src/modules/agents/service.ts:162`
  Validate every requested skill id against the agent's workspace before replacing links, and filter linked-skill reads by `skills.workspace_id`. A valid foreign UUID otherwise satisfies both FKs and creates a cross-workspace prompt-instruction leak.

- 2026-06-29 · Skill Stats uses multi-touch attribution and excludes legacy traces from its frequency denominator · evidence: `server/src/modules/skills/repository.ts:119`
  A completed run is credited to every skill recorded in `trace.config.skills`; traces without that field predate skill observability and are not counted. Select only the JSONB `config.skills` subpath in SQL—full trace documents include prompts/raw output and are too large to hydrate for aggregation.

- 2026-06-20 · `multi_agent_runs` exists but has NO FK from `agent_runs` — group party runs by `ran_at` time window (60s), not by id.
  evidence: `server/src/db/schema/runs.ts:8-50`
  The `agent_runs` table has no `multi_agent_run_id` column; the relationship is implicit (created within ~seconds of each other under the same `pr_id`). Code that needs to roll up "the latest party" (e.g. PR-detail cost+tokens) sorts completed runs by `ran_at DESC`, takes the newest timestamp, then includes everything within ±60s of it. See `lastPartyStats` in `server/src/modules/pulls/routes.ts`. Do NOT assume a FK exists.

- 2026-06-20 · New fields on `RunSummary` (Zod contract returned by repo) MUST be `.nullable().optional()`, not just `.nullable()` — repo layer can't fill them, service layer enriches.
  evidence: `server/src/vendor/shared/contracts/trace.ts:94-114` + `server/src/modules/reviews/repository/run.repo.ts:51`
  The repo returns `RunSummary[]` typed from the schema; if a field is required (even nullable), TS fails compilation because repo doesn't set it. Service `listRuns()` wraps the repo output and adds derived fields (cost_usd from PriceBook). Pattern: derived/enriched fields go `.nullable().optional()`; the service layer overwrites the optional.

- 2026-07-05 · Read-time "brief" features (Smart Diff) are their own module that COMPOSES already-persisted data with zero LLM + zero persistence — split a pure `compose.ts` from a DB-reading `service.ts` so the core is hermetically testable · evidence: `server/src/modules/smart-diff/compose.ts` (pure `(files, findings) => SmartDiff`) + `server/src/modules/smart-diff/service.ts:34-45`
  Unlike the Intent Layer (which ADDS a cheap LLM pass — see the 2026-07-04 note), Smart Diff must never touch `container.llm`: the service only reads `prFiles` + the LATEST review's findings (`reviewsForPull` is newest-first → `.find(r => r.review.kind === 'review')`) and delegates to the pure composer. Route `GET /pulls/:id/smart-diff` lives in a dedicated module registered in `modules/index.ts`. Reuse this shape for upcoming blast/brief read features: pure core + thin DB service, unit-test the core with plain arrays (no `Container`).

- 2026-07-05 · The reviews domain persists NO per-file summary — only whole-PR `reviews.summary` + per-file `findings` (file/start_line/severity/title) · evidence: `server/src/db/schema/reviews.ts:22` (summary) + `:28-46` (findings)
  So any per-file "what this does" line (e.g. Smart Diff's `pseudocode_summary`) can only be REUSED from findings (we take the highest-severity finding's title) or needs a new model call — no neutral per-file description is stored anywhere. Don't assume one exists because a design mock shows it.

## Tool & Library Notes

- 2026-06-23 · OpenAI SDK 4.x requires `fetch: globalThis.fetch` in the constructor on Node 22+/24 — otherwise its bundled node-fetch v2 shim causes "Premature close" · evidence: `server/src/adapters/llm/openai.ts:52`
  The SDK bypasses Node's native fetch (undici) even on Node 22+ and falls back to its own node-fetch v2.7.0 shim, which has a bug reading chunked HTTP responses. Any `new OpenAI({...})` call here must include `fetch: globalThis.fetch`. See reviewer-core/INSIGHTS.md for the full diagnosis path.

- 2026-06-20 · Vendored shared contracts (`client/src/vendor/shared/contracts/`) are NOT synced by any script — edits to `server/src/vendor/shared/contracts/` require manual `cp` to the client copy.
  evidence: `server/CLAUDE.md` do-not-touch + `client/src/vendor/shared/contracts/{trace,platform}.ts`
  There is no `pnpm sync-shared` or similar. After editing a Zod schema on the server, `cp server/src/vendor/shared/contracts/<file>.ts client/src/vendor/shared/contracts/<file>.ts`. Otherwise client compiles against a stale shape and runtime parse silently strips your new field (per `fastify-type-provider-zod` serializer behavior). Same applies for any new file added to the contracts folder.

## Recurring Errors & Fixes

- 2026-06-29 · RESOLVED: DB CLI entrypoints must normalize `process.argv[1]` with `pathToFileURL(resolve(...))` on Windows · evidence: `server/src/db/{migrate,seed}.ts`
  Comparing `import.meta.url` to ``file://${process.argv[1]}`` silently skipped both commands on Windows while returning exit code 0. As a result, `dev.sh` appeared healthy but neither migrations nor seed ran; keep CLI-main detection URL-normalized.

- 2026-06-29 · RESOLVED: `writeFileAt` now uses `path.dirname`, so indexer pipeline tests create nested files on Windows · evidence: `server/test/indexer-pipeline.test.ts:140`
  The six Windows-only ENOENT failures described below now pass; keep path construction separator-agnostic in test helpers.

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

- 2026-07-05 · `path.isAbsolute('/etc/passwd')` returns `false` on Windows — root-relative paths bypass the POSIX-only guard · evidence: `server/src/modules/reviews/run-executor.ts` candidate-path filter + `server/src/adapters/git/simple-git.ts:129-137`
  On Windows, Node's `path.isAbsolute` treats leading-`/` paths as root-relative (relative to the current drive), not absolute — so `isAbsolute('/etc/passwd.md')` is `false`. For security filters on author-controlled paths, always add `/^[/\\]/` (rooted path) and `/^[a-zA-Z]:/` (Windows drive-letter) checks alongside `isAbsolute`. The PRIMARY defence is the adapter-level containment check in `SimpleGitClient.readFile` (resolve + startsWith base+sep), which catches everything regardless of platform. The secondary filter in `deriveIntent` is defence-in-depth but cannot be the only line of defence on Windows.

## Session Notes

## Open Questions
