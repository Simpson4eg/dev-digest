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
<!-- Each is one testable statement with an ID. Use the EARS patterns below. -->
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

## EARS quick-reference (delete before saving, or keep in TEMPLATE.md only)

Every acceptance criterion is a single testable statement. Five patterns:

1. **Ubiquitous** (always): "The system **shall** …"
2. **Event-driven** — `WHEN <trigger>, the system **shall** <response>`
3. **State-driven** — `WHILE <state>, the system **shall** <response>`
4. **Unwanted behavior** — `IF <condition>, THEN the system **shall** <response>`
5. **Optional feature** — `WHERE <feature is present>, the system **shall** <response>`

Translate vague → testable:

| Vague | EARS |
| --- | --- |
| "Works fine on big repos" | **WHEN** a repo exceeds the indexing threshold, the system **shall** generate the overview from deterministic facts only |
| "Shouldn't crash if the model is down" | **IF** the structured model call fails, **THEN** the system **shall** render a deterministic skeleton with the reason |
| "Hint where to start reading" | The system **shall** order the reading path by import-graph file rank, not alphabetically |
