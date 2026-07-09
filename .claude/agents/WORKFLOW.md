# SDD workflow — spec → plan → implement → review → verify

The end-to-end pipeline for building a feature with DevDigest's agents. The `README.md` in
this folder describes each agent in isolation; **this file is the orchestration** — the order,
the hand-off artifacts, and the fix-loops that connect them.

The orchestrator is the **main chat** (you). Subagents cannot spawn other subagents, so every
hand-off, every fix-loop, and any pre-flight recon is driven from the main chat.

## The pipeline

```
1. spec-creator      → writes specs/SPEC-NN.md            (the "what/why", EARS AC)
        │                user reviews & approves
        ▼
2. implementation-planner → writes plans/PLAN-NN.md       (the "how": task graph)
        │                (optional pre-flight: Explore/researcher gathers the reuse
        │                 brief so the opus planner reads less — see "Cost" below)
        │                user picks multi-agent vs single-agent
        ▼
3. implementer ×N    → code + existing tests green         (one per task, in parallel)
        ▼
4. architecture-reviewer → structural findings ──┐
        │                                          │ fix-loop → implementer
        ▼                                          │
5. /code-review (bug pass) → correctness findings ─┤ fix-loop → implementer
        │                                          │
        ▼                                          │
6. test-writer       → new tests; surfaces source bugs ─┘ fix-loop → implementer
        ▼
7. plan-verifier     → coverage: every AC / plan item MET? (read-only)
        ▼
8. /pr-self-review   → BLOCKING gate before git push / gh pr create
```

## Right-sizing — run the lightest lane that works

The full pipeline is for **net-new features and cross-module changes**. Do **not** pay its cost
on small work — that is the "10× slowdown" antipattern. Match the lane to the change:

- **Trivial** (≈≤ 50 lines, one file, no new contract): skip spec **and** plan. Edit directly,
  then `/code-review` + `/pr-self-review`. (`spec-creator` and `implementation-planner` already
  self-eject here — "too trivial → hand back".)
- **Medium** (one module, clear requirements, no cross-module contract): skip the spec; write a
  short plan (or task list) and run `/implement`.
- **Full** (net-new feature, cross-module, or a contract change): the whole pipeline below.

**Not yet a feature?** If requirements are unformed or the work is exploratory ("will this even
work?"), do **not** force SDD — spike with the `researcher` agent or a throwaway branch first,
then write the spec once the shape is known.

## High-stakes specs — cross-model review (opt-in)

A spec authored and reviewed by the **same model family** shares that model's blind spots. For a
**high-stakes** spec (irreversible data migration, auth/security surface, an external contract,
anything expensive to get wrong), run one **cross-model** pass before approval — e.g.
`/code-review` on the spec file, or a second read-only critic on a *different* model than the
author. This is **opt-in, not default**: skipping it on routine specs is fine; skipping it on
high-stakes ones is the antipattern. It is a spec-phase step, separate from the sonnet code
reviewers in `/implement`.

## Hand-off artifacts (files, not chat scrollback)

Each stage persists its output to a **file** so the next stage (often a fresh chat) reads it
instead of re-deriving it — this is what keeps a multi-chat run cheap and drift-free.

| Stage | Reads | Writes |
|-------|-------|--------|
| spec-creator | feature idea, module `AGENTS.md`/`INSIGHTS.md` | `specs/SPEC-NN.md` |
| implementation-planner | `specs/SPEC-NN.md` | `plans/PLAN-NN.md` |
| implementer ×N | `plans/PLAN-NN.md` | source + tests |
| reviewers / verifier | `plans/PLAN-NN.md`, `specs/SPEC-NN.md`, code | findings (report) |

## Ordering rationale

- **Structure before tests.** Run architecture-reviewer (and the bug pass) and apply fixes
  *before* test-writer — otherwise you lock tests around a structure you're about to change.
- **A bug pass is not architecture.** `architecture-reviewer` checks *structure only* (layer
  boundaries, dependency direction, port/adapter) — it will **not** catch logic bugs
  (off-by-one, inverted condition, missing `await`). Use **`/code-review`** for correctness.
  These are different tools; run both.
- **Verify coverage late.** `plan-verifier` needs code (and ideally tests) to exist — there is
  nothing to verify earlier. Coverage of *the plan by AC* (does every AC have an owning task?)
  is already the planner's job (its `Requirements coverage` table); don't duplicate it early.
- **The gate is always last.** `/pr-self-review` hard-blocks `git push` / `gh pr create` on any
  CRITICAL / secret_leak / lethal_trifecta. Run it on the final working tree, once.

## Fix-loops — who applies findings

The three reviewers (`architecture-reviewer`, `plan-verifier`, `/pr-self-review`) and
`test-writer` are **read-only w.r.t. source** — they emit findings but do not fix. Closing the
loop is the orchestrator's job: route each finding back to an **`implementer`** (in its owner
lane) to fix, then re-run the reviewer. A `NOT MET` from plan-verifier, a CRITICAL from the
gate, or a source bug surfaced by test-writer is not "done" until an implementer has fixed it
and the reviewer re-passes.

## Status transitions & anti-drift

- **Spec:** spec-creator sets `draft`; **user** approves `draft → approved`; plan-verifier's
  MET verdict backs `approved → implemented` (the orchestrator flips it).
- **Plan:** planner sets `draft`; user approves; orchestrator marks `in-progress` at step 3 and
  `done` after step 7 passes.
- **No flip while the document and the code disagree.** If implementation deliberately diverged
  from the spec/plan (a better shape emerged, a task was dropped or added), that document is now
  **stale** — do **not** flip it to `implemented`/`done`. Since `spec-creator` and
  `implementation-planner` are the *only* writers of those files and run **manually, upstream**,
  the orchestrator must **hand the divergence back** to update the document (or, for a tiny
  deviation, record it as an explicit deviation note) *before* the status flip. Reconcile the
  doc — never let it rot silently. This is the forcing function against spec/plan rot.

## Cost notes

- **Planner is the expensive step** (opus + eager repo reading). Two levers, both driven from
  the main chat: (a) run **`Explore`/`researcher`** first to produce the reuse-and-insights
  brief, so the opus planner reasons over a summary instead of grepping the whole repo; (b)
  keep planning in one chat so the stable `AGENTS.md`/`INSIGHTS.md` reads stay in the prompt
  cache. The planner does **not** run tests (it is read-only) — it only writes the success-check
  command into each task; the implementer runs it.
- **Model split:** authoring/planning agents are opus (spec-creator, implementation-planner);
  everything downstream is sonnet — implementer, test-writer, **architecture-reviewer, and
  plan-verifier** (both moved off opus for cost; the trade-off is slightly shallower structural
  reasoning, revisit if quality drops). No opus agent runs in the automated `/implement`
  pipeline.

## After a run — retro (manual)

A full pipeline pass is a multi-agent run whose real cost hides in the fan-out. When a run is
worth dissecting, invoke the **`workflow-retro`** skill: it measures tokens / cache-hit /
tool-calls / parallelism **including nested subagents** (which the parent `<usage>` omits),
turns that into concrete tuning actions (tighten a brief, pre-fetch a shared file, merge/split
agents, change concurrency, fix a model mismatch), and appends a trend line to
`docs/retros/ledger.md`. It is **manual, never hooked**, and is the entry point for the L07/L08
observability & cost work.

## Automated subset — the `/implement` command

`.claude/commands/implement.md` runs the **downstream** half of this pipeline automatically
from an already-approved plan: implement ×N → architecture-reviewer (+fix loop) → `/code-review`
bug pass (+fix loop) → plan-verifier → `/pr-self-review` gate, with all fix-loops **bounded**
and re-reviewing only changed hunks. It deliberately **skips test-writer** (token savings) and
**never runs spec-creator or implementation-planner** — those stay manual and upstream. Steps
1–3 above (spec, plan, user approval) are the human-run prerequisites for the command.
