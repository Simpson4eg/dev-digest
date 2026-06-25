# Eval 02 — docs-only session skips correctly

Tests that the skill correctly **does not** fire on pure documentation work.

## Scenario

User: "Re-word the `server/docs/setup.md` env-vars table; add an example
`.env.local` block; nothing else."

Files touched: `server/docs/setup.md`, `server/.env.example`. ~20 minutes.
No `*.ts` / `*.tsx` files modified.

## Expected behavior

1. **Checkpoint 1 still fires.** Even for docs work, reading
   `server/INSIGHTS.md` is cheap and the agent might surface a relevant
   anti-pattern (e.g., "don't put secret values in `.env.example`"). Top-3
   summary is still produced.
2. **Code change does NOT happen** — only docs/config.
3. **Checkpoint 3 fires and concludes: no entry.** The "When to apply" section
   of SKILL.md is unambiguous: pure docs/config edits do not trigger a write.
   The agent must state this explicitly:
   `No INSIGHTS update — docs-only session.`
4. **No file is created or modified** in any `<package>/INSIGHTS.md`.

## Failure modes to catch

- Agent writes "Updated the env vars table" → wrong: trivial doc work is not a
  finding.
- Agent writes "`.env.example` should never contain real secrets" → already
  obvious from the file's purpose; fails the quality bar (reader of the code
  derives this).
- Agent skips checkpoint 1 entirely because "it's just docs" → wrong; the
  read is mandatory regardless of write decision.
