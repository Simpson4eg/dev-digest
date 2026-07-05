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

- 2026-06-29 · `git mv <folder>` errors if the folder has a git-tracked *deleted* file inside it · evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/` (constants.ts staged D)
  Git reports "bad source" even though the file no longer exists on disk. Workaround: `mv` the folder normally then restage with `git add -A`; or `cp -r` + `rm -rf` for Windows permission-denied cases.

## Codebase Patterns

- 2026-06-29 · All TanStack Query keys go through the `qk` factory — never inline
  a `["…"]` array · evidence: `client/src/lib/query-keys.ts:13`
  Hooks (`client/src/lib/hooks/*.ts`) and page invalidations both build keys from
  `qk`, so a query and its `invalidateQueries` can't drift (the bug `client/AGENTS.md`
  warns about). `provider-models` relies on prefix matching: `qk.providerModels()`
  must stay a prefix of `qk.providerModelsFor(provider)` or broad invalidation breaks.
- 2026-06-29 · PR-detail severity colour/order constants are feature-level, not
  per-component · evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/findings.constants.ts:14`
  Shared by FindingCard / FindingsTab / FindingsPanel / RunTraceDrawer's
  FindingsSection. They previously each kept a private copy and drifted —
  `SUGGESTION` was `var(--accent)` in the trace view vs `var(--sugg)` everywhere
  else. Add new severity styling here, not inline. The list-page `PRRow` keeps its
  own lowercase-keyed map on purpose (different feature, different shape) — don't merge them.
- 2026-06-29 · PR-detail page orchestration lives in a hook, page is layout-only ·
  evidence: `client/src/app/repos/[repoId]/pulls/[number]/_lib/usePrDetailPage.ts:27`
  number→uuid resolution, all queries/mutations, and `?tab`/`?trace` state are in
  `usePrDetailPage`; `page.tsx` just renders what it returns. Add data/handlers to
  the hook, not the component body.

- 2026-07-05 · Smart-Diff overlay reuses the shared diff-viewer `FileCard`/`CodeLine` via OPTIONAL props (`findingLines`, `summary`, `anchorId`, `highlight`); a finding's line number is the NEW-file number (`Line.newNo` from `parsePatch`), and scroll anchors use `lineAnchorId(path, newNo)` = `sd-<path>-L<n>` · evidence: `client/src/components/diff-viewer/FileCard/FileCard.tsx:34,158` + `client/src/components/diff-viewer/helpers.ts:4-9`
  Findings carry `start_line` in NEW-file numbering, which matches `Line.newNo` (hunk and `del`-only lines have no `newNo` and are never anchored). To jump-to-line anywhere in the diff viewer, reuse `lineAnchorId` + `document.getElementById(...)` then `?.scrollIntoView?.(...)` (guard the call — jsdom doesn't implement it). All props are optional, so the plain Files-changed `DiffViewer` path is untouched.

## Tool & Library Notes

- 2026-07-05 · Rendering any diff-viewer `FileCard` (hence `SmartDiffViewer`) in a test needs `NextIntlClientProvider` with messages keyed under the `shell` namespace — `messages={{ shell: <messages/en/shell.json> }}` — because `FileCard` calls `useTranslations("shell")` · evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/SmartDiffViewer/SmartDiffViewer.test.tsx`
  Passing the raw `shell.json` (not wrapped under a `shell:` key) resolves nothing and next-intl throws/falls back. The provider-map namespace must match the `useTranslations(<ns>)` argument of every component under test.

- 2026-06-29 · Moving a component folder breaks every absolute `@/` import that names the old path, including ones inside the component itself · evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/trace/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:9-12`
  RunTraceDrawer's sub-components (`ToolCallRow`, `TraceBody`, `TraceSection`, `FindingsSection`, `PromptBlock`) used `@/app/repos/.../RunTraceDrawer/styles` etc. — all broke after `RunTraceDrawer/` moved to `trace/RunTraceDrawer/`. Before any folder rename, grep the old path in the codebase; `@/` aliases are invisible to simple `../` diffing.
- 2026-06-29 · `vi.mock(...)` depth in test files counts directories exactly like `messages/` relative imports · evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/trace/RunTraceDrawer/RunTraceDrawer.test.tsx:22`
  After moving to a deeper folder (one extra `_components/trace/` prefix), both `"../../../../../../../../messages/en/runs.json"` AND `"../../../../../../../lib/hooks/trace"` mocks needed one extra `../`. The message-import fix is obvious; the vi.mock fix hides behind a runtime "No QueryClient set" error, not an import error — typecheck passes but tests fail.

- 2026-06-29 · Two verification footguns when scripting edits/checks here ·
  evidence: `client/package.json:8` (`"typecheck": "tsc --noEmit"`)
  (1) Client `.ts`/`.tsx` files are CRLF — a `perl -pi`/`sed` regex anchored on
  `\n` (e.g. inserting after an import line) silently no-ops because `\r` sits
  before `\n`; match without the newline. (2) `pnpm typecheck 2>&1 | tail -N && echo $?`
  prints *tail's* exit (always 0), masking a real `tsc` failure — capture pnpm's
  own code: `pnpm typecheck; echo "EXIT=$?"`. Tests don't catch type errors
  (vitest/esbuild strips types), so a masked typecheck = silently broken types.

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
