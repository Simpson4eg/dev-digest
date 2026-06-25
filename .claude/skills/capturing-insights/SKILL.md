---
name: capturing-insights
description: Capture practical engineering findings right after finishing a coding task. Use immediately after completing any code change in this repo — implementing a feature, fixing a bug, refactoring, wiring an adapter — to append non-obvious discoveries (hidden cross-module dependencies, gotchas/footguns, measured facts like timings or token counts) to the touched module's INSIGHTS.md. Every entry needs file:line evidence and a date. Trigger after edits under client/, server/, reviewer-core/, or e2e/. Does NOT apply to pure docs/config edits with no code change, and is NOT a summary of what you did.
---

# capturing-insights

Captures non-obvious engineering findings into the touched module's
`INSIGHTS.md`. The point is **compounding knowledge** between sessions: a future
agent (or person) reads the file, knows what to do without re-discovering.

## When to apply

Trigger after **code edits** under `client/`, `server/`, `reviewer-core/`, or
`e2e/`. Sessions worth capturing usually involve a problem solved, a decision
made, or a non-obvious discovery — typically >30 minutes of real work.

Do **not** trigger when:
- The session is pure docs / config / formatting / rename with no code change.
- You're summarizing what you did (use the PR description for that).
- Nothing genuinely non-obvious surfaced (writing low-signal notes harms the
  file — see Quality bar below).

## Three mandatory checkpoints

These are the rules that close the read↔write loop. All three are **required**.

### 1. Pre-work read (active summary)

Before touching code:
- Read `<package>/INSIGHTS.md` for every package the task involves. If the file
  doesn't exist yet, note that — first run for that module.
- Read every reference the user attached for the topic (slide screenshot,
  research dump, linked doc). Mandatory, not "if convenient".
- **MUST** summarize the top-3 entries most relevant to today's task in one
  line of user-facing text. Example:
  `Read server/INSIGHTS.md (3 entries). Most relevant: (a) Drizzle .returning()
  on pgvector ships ~1500 floats — select narrowly; (b) Windows-only ENOENT in
  writeFileAt at indexer-pipeline.test.ts:142; (c) Stripe key seeded in plain
  text — don't re-introduce.`
- This is **active processing**, not passive read. The summary doubles as a
  sanity-check that the file actually loaded *and* that the agent picked the
  right entries for context.

### 2. Pre-write dedupe

Before adding a new entry:
- Re-read the target section in `<package>/INSIGHTS.md`.
- If a similar entry already exists:
  - **Exact match** → skip; nothing to add.
  - **Partial match** → update the existing entry (append today's date and new
    evidence). Do not create a parallel entry — duplicates poison the file.
- Only write when there's no overlap.

### 3. End-of-session signal check

At wrap-up:
- Ask: did anything non-obvious surface that isn't already captured?
  - **Yes** → write an entry per the format below.
  - **No** → write nothing. An empty wrap-up beats noise.
- Trivial work (config bump, rename, format) → no entry.
- This is the single biggest quality lever. The research is consistent:
  >200 mediocre entries drown the file; well under that, signal stays sharp.

## Routing — which INSIGHTS.md gets the entry

| Edits touched           | File to update                |
|-------------------------|-------------------------------|
| `server/**`             | `server/INSIGHTS.md`          |
| `client/**`             | `client/INSIGHTS.md`          |
| `reviewer-core/**`      | `reviewer-core/INSIGHTS.md`   |
| `e2e/**`                | `e2e/INSIGHTS.md`             |
| multiple packages       | write into **each** touched   |

Cross-package insight (e.g. a Zod contract change that ripples server + client):
add one entry per affected package, each phrased from that package's POV.

## File shape — 7 fixed sections

If `<package>/INSIGHTS.md` doesn't exist, create it from
`templates/INSIGHTS.md`. The sections are fixed — don't invent new ones:

1. `## What Works` — patterns/solutions that worked.
2. `## What Doesn't Work` — antipatterns, dead ends. (Most-skipped section,
   most valuable. **Don't skip.**)
3. `## Codebase Patterns` — conventions and architectural decisions.
4. `## Tool & Library Notes` — dependency quirks (versions, limits, defaults).
5. `## Recurring Errors & Fixes` — error → fix pairs you've now seen twice.
6. `## Session Notes` — datestamped session summaries (only when substantive).
7. `## Open Questions` — things you didn't fully resolve.

**If the file exists but a section is missing** (someone manually trimmed it):
insert the missing section under the correct heading **without touching the
other sections**. Don't regenerate the whole file from the template — that
would overwrite real entries.

## Entry format

```markdown
- YYYY-MM-DD · <one-line gist> · evidence: `path/to/file.ts:42`
  <1–3 lines explaining why this matters and when it applies; actionable "cold">
```

Rules:
- **Date is required.** Use absolute `YYYY-MM-DD`, not "yesterday" / "Tuesday".
- **Evidence is required.** A `file:path:line` (or `file:line-line` range) that
  a future reader can open. No evidence → no entry.
- **Append-only.** Add at the bottom of the matching section. Don't reorder,
  don't delete old entries. Correct outdated entries by appending a new dated
  note that references the old one (the file is git-versioned — history matters).
- **Actionable cold.** A future agent reads the entry and knows what to do
  without follow-up. If they'd have to ask "what does this mean?", rewrite it.

## Quality bar

The single test that filters everything:

> **If a reader of the code could derive this themselves, don't write it.**

Bad → noise. Good → fact that takes minutes to discover and seconds to write.

See `examples.md` for bad/good pairs adapted to this repo's stack.

## Anti-banality + duplicate check (= checkpoint 2)

Don't write:
- Restatements of what the framework docs say.
- "Use TypeScript types" / "Test your code" / similar truisms.
- Summaries of what you did this session (that goes in the PR description).
- Project facts that already live in `CLAUDE.md` / `<pkg>/CLAUDE.md`.

If a similar entry exists, update it (date + new evidence) rather than dup.

## Controls (L01 — minimum viable)

- **Append-only.** Never overwrite. Merge conflicts and lost lessons come from
  overwrites.
- **Git-versioned.** `<package>/INSIGHTS.md` is checked into the repo (not into
  `${CLAUDE_PLUGIN_DATA}`). This is deliberate: the file is a team artifact
  reviewed in PRs, and history matters when an entry turns out to be wrong.
- **Draft under review.** This skill writes the first pass; a human spot-checks
  it. Don't treat the file as canonical truth — treat it as a high-signal draft.
- **Trim later.** Past ~200 entries per file, signal-to-noise drops. Future
  work: monthly prune + split into domain files (`INSIGHTS-db.md`,
  `INSIGHTS-llm.md`, …). Not L01's problem.

## Reliability — be honest

This skill's auto-discovery (via description) and the manual
`/capturing-insights` slash-command both depend on the agent **noticing**
the trigger condition. They will be missed sometimes. The reliable fix —
a session-Stop hook that runs the skill automatically — comes in L06. Until
then: best-effort + manual fallback.

## See also

- `examples.md` — bad/good entry pairs (read when judging an entry's quality).
- `templates/INSIGHTS.md` — skeleton for first-time creation.
- `evaluations/` — three walkthrough scenarios you can use to sanity-check
  whether the skill is firing correctly.
- `../../CLAUDE.md` (root) — the `Session Context` + `End of Session` blocks
  that name these three checkpoints as the contract every session honors.
