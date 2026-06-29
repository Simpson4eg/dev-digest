# pr-self-review

Scope: Workflow · Stack: whole repo (client + server + reviewer-core)

## Focus

A local pre-PR gate. Before any GitHub-bound action it reviews **all open
changes** against this repo's *own* skills — routing UI files to the frontend
skills and backend files to the backend/domain skills — and hard-blocks when a
CRITICAL issue (or `secret_leak` / `lethal_trifecta`) is present. It is the
local mirror of the product's server-side review pipeline.

## When to use

- Right before `gh pr create` or `git push` (the `PreToolUse` hook forces this).
- On demand (`/pr-self-review`) to audit the current working state.

## When NOT to use

| Need | Use instead |
|---|---|
| Deep multi-agent cloud review of a branch/PR | `/code-review ultra` |
| Decide *where* new UI code lives | **frontend-architecture** |
| Decide *where* new backend code lives | **onion-architecture** |
| Record a non-obvious finding after a change | **capturing-insights** |
| Draw a diagram | **mermaid-diagram** |

## How it enforces blocking

The skill only reviews; the hard block is a deterministic
`PreToolUse` hook (`.claude/hooks/pr-self-review-gate.mjs`) wired in
`.claude/settings.json`. On a PASS the skill writes
`.git/pr-self-review-pass` (HEAD sha + an open-change digest, never committed).
The hook denies `gh pr create` / `git push` whenever that marker is missing or
stale — so any new commit or edit after a PASS forces a re-review.

## Sources

- Severity / finding contract: `server/src/vendor/shared/contracts/findings.ts`
- Gate logic: `reviewer-core/src/output/to-review.ts`
- Grounding gate: `reviewer-core/src/grounding.ts`
- Diff approach: `server/src/adapters/git/simple-git.ts`
