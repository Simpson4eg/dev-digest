---
spec: SPEC-NN | —
created: <YYYY-MM-DD>
---

# Plan: <feature>  |  Plan ID: PLAN-NN  |  Status: draft
Implements: <SPEC-NN link, or "— (no spec)">

## Goal / Context
<!-- Why this change; the intended outcome. -->

## Execution mode
<!-- multi-agent (N parallel implementers) | single-agent (one sequential pass) — the
     user's confirmed choice. -->

## Affected modules
| Module | Stack | Relevant insights (top-3) |
|--------|-------|---------------------------|
|        |       |                           |

## Requirements coverage
<!-- Map each acceptance criterion (AC-N from the spec) to the task(s) that own it.
     Every AC must have an owner; flag any gap. -->
| Requirement / AC | Owning task(s) | Status (covered / gap) |
|------------------|----------------|------------------------|
| AC-1             | Task 2         | covered                |

## Shared contracts & do-not-touch
<!-- Contract(s) all tasks depend on (read-only unless owned by a task); do-not-touch list. -->
- Contract(s): <path>
- Do-not-touch: migrations, lockfiles, client/src/vendor/shared/, <others>

## Task graph
<!-- A mermaid flowchart of task dependencies (parallel vs sequential). In single-agent
     mode, a linear chain in execution order. -->

## Tasks
| # | Title | Owner path(s) | Domain | Skills | Depends-on | Parallel? | Success check |
|---|-------|---------------|--------|--------|------------|-----------|---------------|
| 1 |       |               | backend/UI/engine | | — | yes/n/a | pnpm test |

## Task detail
<!-- Repeat per task. -->
### Task 1 — <title>
- **Intent:** <what and why>
- **Files:** <exact files to create/modify — reuse first, cite path:line>
- **Skills to apply:** <from the `skill-routing` skill for these paths>
- **Insights to honor:** <baked-in from module INSIGHTS.md>
- **Acceptance test:** <command + expected result>

## Recommendations
<!-- Improvements proposed beyond the literal request — clearly marked *proposed*. Empty if none. -->

## Verification (end-to-end)
<!-- Per-module test/build commands that prove the whole change works together. -->
