# reviewer-core/ — `@devdigest/reviewer-core` (pure review engine)

Pure review logic: **diff → prompt → LLM → grounded findings**. No DB, no
GitHub, no filesystem. The only side effect is an LLM call through an injected
`LLMProvider`, which is what makes it mock-testable.

## Run / verify

| What       | Command                                  |
|------------|------------------------------------------|
| typecheck  | `npm run typecheck` (also acts as build) |
| test       | `npm test` (vitest, hermetic)            |

This package **never emits JS**. Consumers (`server`, future CI runner) import
the TypeScript source directly via tsconfig path alias
(`@devdigest/reviewer-core` → `../reviewer-core/src`). Runs under tsx in dev and
vitest in tests.

Uses **npm**, not pnpm — there's a `package-lock.json` in this folder. Don't run
`pnpm install` here.

## Layout (`src/`)

| File / dir                | what                                                            |
|---------------------------|-----------------------------------------------------------------|
| `index.ts`                | public API surface — only what's re-exported here is consumable |
| `prompt.ts`               | `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`            |
| `grounding.ts`            | `groundFindings`, `groundingSummary` — citation gate            |
| `llm/openrouter.ts`       | OpenRouter `LLMProvider` impl                                   |
| `llm/structured.ts`       | Zod → JSON Schema, `extractJson`, `parseWithRepair`             |
| `output/to-review.ts`     | composes a CI-shaped review payload                             |
| `review/run.ts`           | `run` — single-pass orchestrator                                |
| `review/reduce.ts`        | `reduce` — map-reduce path for large diffs                      |

## Non-default conventions

- **Public API is only what `index.ts` re-exports.** Consumers must not deep-
  import from internal modules — keep the surface narrow.
- **No side effects beyond `LLMProvider`.** No `fs.readFile`, no `fetch` outside
  the provider, no `process.env`. Anything else is a bug.
- **Contracts come from `@devdigest/shared`** (`Review`, `Finding`, `Verdict`,
  …). The engine never redefines them.
- **Optional prompt slots** (`skills`, `memory`, `specs`, `callers`) are accepted
  by `assemblePrompt` and simply omitted when not provided — course lessons fill
  them in over time.

## Gotchas

- **`groundFindings` is mandatory.** A finding without a citation that maps to
  an actual line in the diff is dropped silently. The score is recomputed from
  the survivors — the model's self-reported score is ignored.
- **Injection defense is `INJECTION_GUARD`, not keyword scanning.** A
  denylist of phrases ("ignore previous instructions") catches one phrasing
  and misses the next. The guard is appended to every system prompt by
  `assemblePrompt` and tells the model that wrapped content is **data**, not
  instructions.
- **`wrapUntrusted` fences must be respected.** Anything from the PR (diff,
  body, comments, README) goes through `wrapUntrusted` before reaching the
  model. Bypassing the wrapper reopens the injection hole.

## Do-not-touch

- **Don't add side effects.** If you need a file read, a network call, or a DB
  hit, do it in the consumer (server) and pass the result in.
- **Don't deep-import from this package** when working in consumers. Add an
  export to `index.ts` instead.

## See also

- `README.md` — onboarding
- `docs/pipeline.md` — full data flow (assemble → call → ground → emit)
- `docs/writing-prompts.md` — how to author a system prompt
- `docs/grounding-gate.md` — how citations are validated
- `specs/findings.md` — `Finding` / `Verdict` shape
- `specs/llm-provider.md` — `LLMProvider` interface contract
- `INSIGHTS.md` — non-obvious знахідки з file:line (накопичується skill'ом)
- `../docs/agent-prompts/` — checked-in system prompt originals
- `../CLAUDE.md` — глобальна карта репо
