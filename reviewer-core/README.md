# `@devdigest/reviewer-core` — the review engine

Pure review logic: **diff → prompt → LLM → grounded findings**. No DB, no
GitHub, no filesystem. The only side effect is an LLM call through an
**injected** `LLMProvider`.

In the starter the server (`@devdigest/api`) is the only consumer — for local
reviews in the studio. (The CI runner that runs the same engine in GitHub
Actions arrives in lesson L06.) The server wires it via a tsconfig path alias
(`@devdigest/reviewer-core` → `../reviewer-core/src`) and imports the
TypeScript **source** directly. The package never emits JS — its `build` is a
type-check.

## Quick start

```sh
npm install
npm test          # hermetic, stubbed LLMProvider
npm run typecheck # also acts as the build
```

Uses **npm**, not pnpm. There's a `package-lock.json` in this folder.

## Public API

Exported from `src/index.ts`: `assemblePrompt` / `wrapUntrusted` (prompt),
`groundFindings` / `groundingSummary` (grounding), `toJsonSchema` /
`extractJson` / `parseWithRepair` (structured output), plus `run` and `reduce`.
Contracts (`Review`, `Finding`, `Verdict`, …) come from `@devdigest/shared`.

## Where to look

- **For agents / contributors:** [`CLAUDE.md`](./CLAUDE.md) (purity rules, public
  API discipline, gotchas).
- **How-to** in [`docs/`](./docs/):
  - [`pipeline.md`](./docs/pipeline.md) — assemble → call → ground → emit
  - [`writing-prompts.md`](./docs/writing-prompts.md) — authoring system prompts
  - [`grounding-gate.md`](./docs/grounding-gate.md) — citation validation rules
- **Contracts** in [`specs/`](./specs/):
  - [`findings.md`](./specs/findings.md) — `Finding` / `Verdict` / `Review`
  - [`llm-provider.md`](./specs/llm-provider.md) — injected interface

Checked-in system prompts live in [`../docs/agent-prompts/`](../docs/agent-prompts/).
See [`../TESTING.md`](../TESTING.md) for the suite split.
