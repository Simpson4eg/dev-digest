# Pipeline

Inputs in, grounded `Review` out. Single-pass by default; map-reduce path
available for diffs that don't fit a single context window.

```
inputs (diff, system prompt, repo map, optional slots)
  ↓
assemblePrompt()                            prompt.ts
  - wrapUntrusted() each external input
  - append INJECTION_GUARD to system prompt
  ↓
LLMProvider.complete(...)                   llm/openrouter.ts (injected)
  ↓
parseWithRepair(rawResponse, schema)        llm/structured.ts
  - Zod → JSON Schema (sent to model)
  - extractJson() recovers JSON from chatty replies
  - parseWithRepair() retries once on shape mismatch
  ↓
groundFindings(parsed, diff)                grounding.ts
  - drops findings with no real line citation
  - recomputes score from survivors
  ↓
Review { verdict, score, findings[] }       → consumer persists
```

## Single-pass vs reduce

- `review/run.ts` is the default — one LLM call per agent.
- `review/reduce.ts` chunks the diff, runs the agent per chunk, then reduces.
  Use when the diff blows past the model's context.

## Optional prompt slots

`assemblePrompt` accepts these optional inputs and omits the section if absent:

- `skills` — L02 (skills system)
- `memory` — L07 (retrieval memory)
- `specs` — L05 (intent / smart-diff)
- `callers` — caller graph from repo intel

The starter (server) only passes diff + system prompt + repo map; the rest stay
empty until lessons populate them.

## CI payload

`output/to-review.ts` composes a payload shaped for the GitHub Actions runner
(L06 lesson). Selects the surviving findings, formats them per the CI contract.

## See also

- `docs/grounding-gate.md` — how citations are validated
- `docs/writing-prompts.md` — what goes into a system prompt
- `specs/llm-provider.md` — the injected interface
