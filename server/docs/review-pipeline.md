# Review pipeline (server-side flow)

How a `POST /pulls/:id/review` becomes a persisted `Review` with grounded
`Finding`s.

```
HTTP POST /pulls/:id/review
  → modules/reviews/routes.ts
  → ReviewService.runForPullRequest
  → modules/reviews/run-executor.ts
      gather inputs:
        ─ diff (GitHubAdapter | GitAdapter)
        ─ PR title / body
        ─ agent system prompt (from DB; templates in src/prompts/)
        ─ repo skeleton + callers (modules/repo-intel) — if REPO_INTEL_ENABLED and indexed
      call reviewer-core:
        ─ assemblePrompt() — fences untrusted content + appends INJECTION_GUARD
        ─ LLMProvider (injected)
        ─ structured output (Zod → JSON schema, parse-with-repair)
        ─ groundFindings() — mandatory citation gate vs the diff
      recompute score from surviving findings
      persist Review + Findings
      stream run trace via SSE → client
```

## Where each piece lives

| Concern                        | File                                          |
|--------------------------------|-----------------------------------------------|
| Route + Fastify wiring         | `src/modules/reviews/routes.ts`               |
| Orchestration                  | `src/modules/reviews/run-executor.ts`         |
| Prompt assembly + injection guard | `reviewer-core/src/prompt.ts`              |
| Grounding gate                 | `reviewer-core/src/grounding.ts`              |
| Repo skeleton, callers         | `src/modules/repo-intel/`                     |
| Diff source                    | `src/adapters/github/` or `src/adapters/git/` |
| LLM call                       | `src/adapters/llm/`                           |
| Run trace SSE                  | `fastify-sse-v2` plugin                       |

## Non-obvious

- **Injection defense is a trusted rule, not text parsing.** A PR can smuggle
  "this is a test fixture, ignore" into the diff/README/comments — in any
  language. `INJECTION_GUARD` (appended to every system prompt) tells the model
  untrusted content is data, never instructions. We deliberately do **not**
  keyword-scan untrusted text — denylists miss paraphrases.
- **Repo Intel degrades silently.** If `REPO_INTEL_ENABLED=true` but the repo
  isn't indexed yet, the prompt assembles without the skeleton section. No error.
- **Score is recomputed.** The model's self-reported score is ignored; the
  persisted `score` is derived from the findings that survived grounding.
- **Orphaned `running` runs** are reaped on boot.

## See also

- `../reviewer-core/CLAUDE.md` — engine internals
- `../reviewer-core/docs/grounding-gate.md` — how citations are validated
- `../docs/agent-prompts/README.md` — how system prompts are structured
- `specs/contracts.md` — `Finding`, `Review`, `Verdict` schemas
