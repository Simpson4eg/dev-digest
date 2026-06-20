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

## Session Notes

## Open Questions
