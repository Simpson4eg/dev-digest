---
name: workflow-retro
description: Manual retrospective of a completed multi-agent SDD run (spec-creator →
  implementation-planner → /implement → plan-verifier, plus nested implementers/reviewers/
  researchers). Use after a run worth analysing to measure what it actually cost and how it
  behaved — tokens, cache-hit, tool-calls, durations, parallelism (accounting for nested
  subagents the parent usage omits) — then turn that into concrete tuning actions and append a
  trend line to docs/retros/ledger.md. Manual only, never hooked. Does NOT run the pipeline or
  edit code; it reviews a run that already happened. First touch of observability (L07) and
  cost-engineering (L08).
---

# workflow-retro — how did that run actually go?

Our SDD pipeline is a **multi-agent** run: `spec-creator` + `implementation-planner` +
`implementer` ×N + `architecture-reviewer` + `plan-verifier` (+ nested `researcher`/`Explore`).
That fan-out is where tokens and wall-clock hide. This skill looks back at one such run and
turns it into numbers you can compare and act on. It is **manual** — you invoke it when a run is
worth dissecting; there is no hook.

It never runs the pipeline and never edits code. Its only write is one appended row in
`docs/retros/ledger.md`; everything else is a printed report.

## Two modes — pick by how accurate you need to be

- **in-context (default, fast).** Estimate from the current conversation: the parent's `<usage>`
  and the tool calls you can see. **Caveat — this underestimates:** a parent's usage does **not**
  include the tokens burned inside nested subagents, so a fan-out of N implementers reads far
  cheaper than it was. State this bias in the report.
- **deep (accurate).** Read the run's **session transcript(s) from disk** — Claude Code stores
  them as JSONL (one event per line, each carrying its own token usage) under your
  `~/.claude/projects/<project-slug>/`. Sum usage across the parent **and** every nested
  subagent transcript to get the real total. Use deep mode whenever the cost number matters
  (e.g. the L08 cost-report). If you cannot locate or read the transcript, say so and fall back
  to in-context — do not fabricate numbers.

## Step 1 — Scope the run

State what you are analysing: the feature / `PLAN-NN`, which agents ran (and ×N for fan-out),
the models each used, and the wall-clock window. If several runs are in scope, do one row each.

## Step 2 — Metrics

Collect, per agent **and** rolled up (parent + nested):

- **Tokens** — input / output / **cache-read** separately (cache-read is near-free; conflating
  it with fresh input hides the real cost).
- **Cache-hit** — cache-read ÷ total input. Low hit on a repeated-context run is a red flag.
- **Tool-calls** — count and rough breakdown (Read/Grep/Glob/Edit/Bash/Agent). Lots of
  Grep/Glob inside an agent often means missing pre-fetch.
- **Durations & parallelism** — wall-clock vs summed agent time; how many implementers actually
  ran concurrently vs serialised on a shared contract.

Ground every number: in deep mode cite the transcript; in in-context mode mark figures
`(estimate, nested excluded)`.

## Step 3 — Insights → concrete actions

Don't just report — diagnose. For each finding name a **specific** tuning action:

- **Duplicated context** (same file/spec re-read by many agents) → pre-fetch it once and pass a
  brief; or move the fact into the agent's `AGENTS.md`/`INSIGHTS.md`.
- **Vague agent brief** (agent thrashed, asked, or over-read) → tighten that agent's prompt or
  its task in the plan.
- **Wrong granularity** → **merge** agents that always run together, or **split** one that owns
  too much and serialises the fan-out.
- **Bad concurrency** → change how many implementers run at once, or reorder so shared contracts
  land first.
- **Model mismatch** → an opus agent doing grep-work → sonnet; a sonnet agent producing weak
  output on a compounding step → opus.
- **Missed work** (a reviewer that should have caught X) → adjust that reviewer's scope.

## Step 4 — Trend line

Append **one row** to `docs/retros/ledger.md` (the columns are defined there): date, run, mode,
agents, tokens (in/out/cache), cache-hit, tool-calls, wall, and the single **top action**. Keep
the per-run detail in the printed report; the ledger is only the comparable headline.

## Output — the retro report

```
## Workflow retro — <feature / PLAN-NN>   (mode: in-context | deep)

### Metrics
| Agent | Model | In | Out | Cache-read | Tool-calls | Wall |
|-------|-------|----|----|-----------|-----------|------|
| ...   | ...   | .. | .. | ..        | ..        | ..   |
Rolled up (parent + nested): <tokens, cache-hit, tool-calls, wall>. <bias note if in-context>

### Insights → actions
- <finding> → <specific action>

### Top action (also appended to the ledger)
<the one change most worth making before the next run>
```

## Boundaries

- **Manual, no hook** — this never fires automatically; run it when a run is worth the look.
- **Not `capturing-insights`** — that skill records *code* findings per module during a change;
  this one measures the *run* after it. Different jobs.
- **Bridge:** this is the first touch of **observability (L07)** and **cost-engineering (L08)**,
  and the entry point for the cost-report homework — keep the ledger honest so those build on
  real numbers.
