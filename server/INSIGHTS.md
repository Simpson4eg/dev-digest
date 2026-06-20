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

## Tool & Library Notes

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
