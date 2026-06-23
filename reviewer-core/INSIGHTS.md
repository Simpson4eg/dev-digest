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

## Tool & Library Notes

## Recurring Errors & Fixes

- 2026-06-23 · `"Premature close"` on every OpenRouter call → add `fetch: globalThis.fetch` to the OpenAI constructor · evidence: `reviewer-core/src/llm/openrouter.ts:59`
  Root cause: OpenAI SDK's bundled node-fetch v2 shim fails on Node 22+/24 with OpenRouter's chunked streaming responses. The error appears in the run log immediately after the LLM call starts (under 30s, before any model output). Changing the model slug makes no difference — it's a transport-layer bug, not a model issue. Fix is a one-liner; same fix applies to `server/src/adapters/llm/openai.ts`.

## Session Notes

## Open Questions
