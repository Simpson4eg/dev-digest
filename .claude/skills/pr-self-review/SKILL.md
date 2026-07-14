---
name: pr-self-review
description: "Local pre-PR review gate. Run before any GitHub-bound action (gh pr create / git push) or on demand to review all open changes against this repo's own architecture and security skills. Routes UI files to the frontend skills (frontend-architecture, react-best-practices, next-best-practices, react-testing-library) and backend files to the backend/domain skills (onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design); typescript-expert, zod and security run on both. BLOCKS the PR/push if any CRITICAL finding (or secret_leak / lethal_trifecta) is found."
---

# PR Self-Review

Review **all open changes locally before they leave the machine** — before
`gh pr create` or `git push`. This skill dogfoods DevDigest's own review
philosophy: it classifies each changed file, loads the project skills that
actually govern that file, reviews against them, and **hard-blocks** when a
CRITICAL issue is present.

For rationale and a worked PASS/BLOCK transcript, see [README.md](README.md) and
[examples.md](examples.md).

## When this runs

- **Automatically (gate):** a `PreToolUse` hook on `Bash`
  (`.claude/hooks/pr-self-review-gate.mjs`) denies `gh pr create` / `git push`
  unless this skill has written a current PASS marker. The hook is only the
  deterministic gate — **this skill does the review**.
- **Manually:** invoke `/pr-self-review` any time to audit the working state.

Always run this skill *before* attempting the GitHub action. If you find yourself
blocked by the hook, that is the signal to run the skill, not to bypass it.

## Severity model — reuse the product contract

Do **not** invent a severity scale. Use the one the product ships, in
`server/src/vendor/shared/contracts/findings.ts`:

- `Severity = CRITICAL | WARNING | SUGGESTION`
- `category = bug | security | perf | style | test`
- `kind = finding | secret_leak | lethal_trifecta | phantom | hook`

The gate mirrors `reviewer-core/src/output/to-review.ts` (`gateTriggered`,
default policy `ci_fail_on: 'critical'`):

> **BLOCK** when ≥1 finding is `CRITICAL`, **or** any finding has
> `kind ∈ { secret_leak, lethal_trifecta }`. `WARNING` and `SUGGESTION` are
> reported but never block.

## Step 1 — Collect all open changes

Mirror the product's own diff approach (`server/src/adapters/git/simple-git.ts`).
Run from the repo root:

```sh
base="$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)"
git diff --name-only "$base"...HEAD     # committed on this branch vs main
git diff --name-only                    # unstaged
git diff --cached --name-only           # staged
git status --porcelain                  # includes untracked (?? lines)
```

The **changed-file set** is the union of all four. The **reviewable diff** is
`git diff "$base"` plus the working tree — read those hunks (and the surrounding
file when needed) to ground each finding.

## Step 2 — Classify each changed path

Classify every changed path and load the mapped skills using the **`skill-routing`**
skill — the single source of truth for the path→skill mapping, shared with the
`implementation-planner`, `implementer`, `test-writer`, and the reviewer agents. It
also defines the drop list (`**/migrations/**`, `*/vendor/shared/**` — review the
source of truth under `server/src/vendor/shared/` only, never the `client/` copy,
lockfiles, non-code assets). Load it by name; **do not reproduce the table here.**

`security`, `zod` and `typescript-expert` are cross-cutting — apply them to every
code group. `mermaid-diagram` and `spec-authoring` are **not** review skills and are
never used here.

## Step 3 — Review each non-empty group

For each group that has changed files, load the mapped skills (read their
`SKILL.md`) and review **only that group's changed hunks** against their rules.
Each finding uses the `Finding` shape from `findings.ts`:

`{ severity, category, title, file, start_line, end_line, rationale, suggestion }`

**Ground every finding**: its line range must intersect a real changed hunk in
that file — the same gate the product enforces in `reviewer-core/src/grounding.ts`.
Drop findings that don't ground (exception: `secret_leak` / `lethal_trifecta`
need only the file to be in the diff). Don't pad the report — quality over count,
exactly as the architecture skills' own severity tags intend.

## Step 4 — Aggregate & gate

- Sort findings CRITICAL → WARNING → SUGGESTION (per
  `client/src/.../findings.constants.ts` `SEVERITY_ORDER`).
- `blocked = anyCritical || anySecretLeak || anyLethalTrifecta`.

## Step 5 — Verdict & marker

**If NOT blocked (PASS):**
1. Print the PASS summary (counts by severity; list WARNING/SUGGESTION as
   advisory).
2. Write the pass marker so the hook lets the GitHub action through:
   ```sh
   node "$CLAUDE_PROJECT_DIR/.claude/hooks/pr-self-review-gate.mjs" --write-marker
   ```
   The marker encodes HEAD sha + a digest of staged, unstaged, and untracked
   changes; any later commit or edit invalidates it and forces a re-review.

**If blocked (BLOCK):**
1. Print every blocking finding with `file:start_line`, the rule it violates,
   and the suggested fix.
2. **Do not** write or refresh the marker.
3. Explicitly refuse to run `gh pr create` / `git push`. Tell the user to fix the
   CRITICAL findings and re-run `/pr-self-review`.

## Output format

```
PR Self-Review — base <sha>, <N> changed files

UI (client/src) ............ 3 files   ▸ frontend-architecture, react-, next-, security, zod
Backend (server/src) ....... 2 files   ▸ onion-architecture, fastify-, security, zod

CRITICAL (1)
  server/src/adapters/github/client.ts:42  [security/secret_leak]
    Hardcoded token committed to source.
    → Move to SecretsProvider (~/.devdigest/secrets.json); read via env fallback.

WARNING (1)
  client/src/app/.../page.tsx:8  [style] 'use client' at route top — push to leaf.

VERDICT: BLOCK — 1 CRITICAL. PR/push refused. Fix and re-run /pr-self-review.
```

A clean run ends with `VERDICT: PASS` and writes the marker.
