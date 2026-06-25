# Writing a system prompt

System prompts live in two places:

1. **Originals** (checked into git, human-edited) — `docs/agent-prompts/*.md` at
   the repo root. See [`../../docs/agent-prompts/README.md`](../../docs/agent-prompts/README.md)
   for the structure used by the three built-in agents
   (General / Security / Performance).
2. **Runtime** — `agents.system_prompt` column in the DB, seeded from the
   originals by `server/src/db/seed.ts`. The Agent editor surfaces the runtime
   copy; edit the originals when you want the change tracked in git.

## Rules

- **Be explicit about the output schema.** The model receives both your prompt
  and a JSON Schema derived from the Zod `Review` contract. Mention key fields
  by name (`verdict`, `findings[].severity`, `findings[].file`).
- **Cite line numbers.** Findings without a citation that lines up with the diff
  are dropped at the grounding gate. Tell the model to emit
  `findings[].startLine` / `endLine` from the diff.
- **Don't restate the injection guard.** `assemblePrompt` appends
  `INJECTION_GUARD` to whatever you write; restating weakens the trusted
  framing.
- **Stay focused.** A "review everything" prompt produces watery findings. The
  three built-in agents are narrow on purpose (general / security / perf).

## Testing a prompt

1. Edit `docs/agent-prompts/<your-agent>.md` at the repo root.
2. Re-run `pnpm db:seed` in `server/` — idempotent, will pick up the change for
   the seeded agent.
3. Trigger a review against the demo PR (`acme/payments-api` #482) and inspect
   the run trace.

## Model choice

See [`../../docs/agent-prompts/choosing-a-model.md`](../../docs/agent-prompts/choosing-a-model.md).

## See also

- `docs/pipeline.md` — how `assemblePrompt` consumes your prompt
- `../../docs/agent-prompts/README.md` — message assembly + injection guard
