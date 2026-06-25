# INSIGHTS — client

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

- 2026-06-19 · `pnpm install` in `client/` can EPERM on `@next/swc-*` when a
  prior `next dev` / `node` process is still holding the native `.node` binary.
  evidence: `client/package.json:6` (`"dev": "next dev -p 3000"`)
  Windows holds exclusive locks on loaded `.node` binaries; pnpm can't replace
  them mid-install. Fix before reinstalling: `taskkill /F /IM node.exe` (or
  `Get-Process node | Stop-Process -Force`), close any VS Code window with the
  project open, then re-run `pnpm install`. Do NOT delete `node_modules` — a
  full reinstall here is slow and unnecessary.

## Recurring Errors & Fixes

- 2026-06-23 · `MISSING_MESSAGE: Could not resolve 'prReview.list.columns.<key>'` — `COLUMN_KEYS` and `messages/en/prReview.json` are out of sync · evidence: `client/src/app/repos/[repoId]/pulls/constants.ts:42-50` + `client/messages/en/prReview.json:89-97`
  next-intl gives no build-time error and no TS error — it silently falls back to the key string and logs a console warning at runtime. Whenever a column is added to or removed from `COLUMN_KEYS`, the matching key under `list.columns` in `client/messages/en/prReview.json` must be updated in the same commit. There is no automated check enforcing this.

## Session Notes

## Open Questions
