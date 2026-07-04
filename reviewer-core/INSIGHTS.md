# INSIGHTS — reviewer-core

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

- 2026-06-23 · OpenAI SDK 4.x ships node-fetch v2 as its default fetch shim — on Node 22+/24 this causes "Premature close" reading chunked OpenRouter responses · evidence: `reviewer-core/src/llm/openrouter.ts:51-60`
  The SDK resolves `_shims/auto/runtime.js` → `web-runtime.js` → node-fetch v2.7.0 even when Node's native fetch (undici) is available. node-fetch v2 has a bug reading chunked HTTP bodies on Node 22+ — gets HTTP 200 then throws "Premature close" before the body is consumed. Fix everywhere: pass `fetch: globalThis.fetch` to `new OpenAI({...})`. Diagnose by inspecting `client.fetch.toString()` — if the output mentions "native promise missing", you're on node-fetch v2.

## Codebase Patterns

- 2026-07-04 · Intent derivation is a SEPARATE exported pass, not part of `reviewPullRequest` — the engine doc explicitly excludes intent ("caller owns it") · evidence: `reviewer-core/src/review/run.ts:19-23` + `reviewer-core/src/review/intent.ts`
  `extractIntent()` is its own `completeStructured<Intent>` call the consumer runs BEFORE the review; it reuses `assemblePrompt` so the untrusted PR body + diff get `wrapUntrusted` + `INJECTION_GUARD` (never build raw messages for a new LLM pass). Its result is fed back into the review via the new optional `intent` slot on `ReviewInput`/`PromptParts` (rendered `## Derived intent`, wrapped, right before the diff — omit-when-empty like `callers`/`repoMap`). When adding another cheap pass (risk brief, conformance), follow this shape: new pure fn in `src/review/`, export from `index.ts`, reuse `assemblePrompt`.

- 2026-07-05 · `diffSkeleton` is passed through the existing `diff` slot of `assemblePrompt`, NOT a new slot — so it gets `wrapUntrusted` for free · evidence: `reviewer-core/src/review/intent.ts:118-124`
  When you swap a full diff for a skeleton, you might expect to add a new `skeleton` slot to `PromptParts`/`assemblePrompt`. Don't — the `diff` slot already wraps its content in `<untrusted source="diff">`. Passing the skeleton through that slot means zero changes to `assemblePrompt` and the injection guard stays active. This pattern applies whenever you replace diff content with a reduced representation for a cheap pass.

- 2026-07-05 · Trusted behavior-control rules (scope / noise-reduction) must live in the SYSTEM message AFTER `INJECTION_GUARD`, never inside an `<untrusted>` block · evidence: `reviewer-core/src/prompt.ts:30-40` (`SCOPE_RULE`) + `assemblePrompt` logic
  The scope rule ("at most ONE out-of-scope signal finding") is appended to the system message only when `intent` is present. Placing it inside the untrusted intent block would mean the model could discard it as data. Phrasing constraint: the rule must NOT contradict `INJECTION_GUARD` — specifically, must keep the "real defects always reported" clause intact. Use phrasing like "for issues clearly OUTSIDE the PR's intent, emit at most ONE consolidated signal finding" to scope the rule to nits, not bugs.

## Tool & Library Notes

## Recurring Errors & Fixes

- 2026-07-04 · Curly/smart apostrophes in TS string literals cause TS1127 "Invalid character" on tsc (Windows + strict) -- full file rewrite required · evidence: `reviewer-core/src/review/intent.ts:28-51` (original had U+2019 right single quotes)
  Partial edits that mix new ASCII quotes with pre-existing smart quotes trigger a cascade of TS1127/TS1434/TS1435 errors. The TypeScript compiler rejects any non-ASCII character inside a string literal unless it is inside a template literal or a comment. When you encounter this, rewrite the entire constant with straight ASCII quotes or backtick template strings -- a targeted Edit will just reintroduce the mix.

- 2026-06-23 · `"Premature close"` on every OpenRouter call → add `fetch: globalThis.fetch` to the OpenAI constructor · evidence: `reviewer-core/src/llm/openrouter.ts:59`
  Root cause: OpenAI SDK's bundled node-fetch v2 shim fails on Node 22+/24 with OpenRouter's chunked streaming responses. The error appears in the run log immediately after the LLM call starts (under 30s, before any model output). Changing the model slug makes no difference — it's a transport-layer bug, not a model issue. Fix is a one-liner; same fix applies to `server/src/adapters/llm/openai.ts`.

## Session Notes

## Open Questions
