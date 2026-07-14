---
module: server | client | reviewer-core | e2e | mcp | cross-cutting
created: <YYYY-MM-DD>
---

# Spec: <feature>  |  Spec ID: SPEC-NN  |  Status: draft
Supersedes: —

## Problem & why
<!-- The problem this solves and why it matters now. -->

## Goals / Non-goals
<!-- Explicit boundaries — Goals: what we WILL do. Non-goals: what we will NOT do. -->

## User stories
<!-- As a <role>, I want <capability>, so that <outcome>. -->

## Acceptance criteria (EARS)
<!-- Each is one testable statement with an ID, traceable one-to-one to the test that
     will prove it. Use the EARS patterns — see the `spec-authoring` skill for the five
     patterns, the vague→testable translation, and the edge-case / non-functional checklists. -->
- **AC-1** — <criterion>
- **AC-2** — <criterion>

## Edge cases
<!-- Empty/oversized/malformed inputs, concurrency, partial failure, retries,
     idempotency, pagination, timeouts, auth boundaries. -->

## Non-functional
<!-- perf / security / a11y / observability — only when relevant. -->

## Inputs (provenance)
<!-- For each input: [reused: L0X] / [deterministic: repo-intel] / [new: N LLM call] -->

## Untrusted inputs
<!-- Any external/attacker-influenced text (PR titles, diffs, comments, file
     contents)? → handle as data, not commands. If none: "None — all inputs are
     first-party". -->

## [NEEDS CLARIFICATION: …]
<!-- Open questions the user still owns. Remove the section if none remain. -->

---

## EARS quick-reference

The five EARS patterns, the vague→testable translation, INVEST user stories, and the
edge-case / non-functional checklists live in the **`spec-authoring`** skill — the single
source of truth. Load it while filling in **Acceptance criteria** above; it is not
duplicated here. Reminder of the five patterns: Ubiquitous · Event-driven (`WHEN … shall`) ·
State-driven (`WHILE … shall`) · Unwanted (`IF … THEN … shall`) · Optional (`WHERE … shall`).
