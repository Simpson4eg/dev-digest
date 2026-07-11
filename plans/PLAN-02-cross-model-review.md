---
plan: PLAN-02
spec: SPEC-02
created: 2026-07-11
reviewer_model: openai/gpt-4o (via OpenRouter)
---

# Cross-model review — PLAN-02 (Why + Risk Brief)

An **independent** staff-engineer review of `PLAN-02` against `SPEC-02`, performed by a
**different-family model** (`openai/gpt-4o`) with **no access** to the authoring chat, reasoning,
or the codebase — only the spec + plan text. Run via `scripts/cross-model-review.mjs`.

- **Model:** `openai/gpt-4o` (OpenRouter)
- **Input:** SPEC-02 + PLAN-02, ~18.5K tokens in / 441 out
- **Date:** 2026-07-11

## Verbatim findings

1. **[BLOCKER]** The plan does not explicitly address the handling of untrusted inputs in the
   assembly step (Task 3). It should ensure that all untrusted content is properly fenced with
   `wrapUntrusted` in the `composeBrief` function (Task 4), but the plan should also verify that
   the assembly step structures inputs in a way that facilitates this fencing.
2. **[BLOCKER]** The plan assumes that an in-process lock (a `Map<key, Promise>`) is sufficient for
   handling concurrent regenerates (Task 6). This assumption is risky if the system ever scales
   beyond a single-node deployment. The plan should explicitly document this assumption and consider
   potential future scalability issues.
3. **[SHOULD-FIX]** The plan does not detail how the system will handle the case where the token
   count exceeds 8,000 after truncation attempts. While it mentions deterministic truncation, it
   should specify the behavior if truncation fails to bring the input under the limit.
4. **[SHOULD-FIX]** The plan does not explicitly mention testing for the scenario where a
   fully-empty input set results in zero LLM calls and returns the "not enough signal yet" brief.
   This scenario should be explicitly tested to ensure compliance with AC-3b.
5. **[SHOULD-FIX]** The plan does not address potential security concerns related to the cache, such
   as ensuring that cached data is not served to unauthorized users. It should include measures to
   verify that cache reads are tenant-safe and scoped by workspace ID.
6. **[NIT]** The plan's task graph and execution mode suggest a complex multi-agent execution, but
   given the context of Sonnet implementers with a protected context window, a simpler single-agent
   execution might be more appropriate to reduce complexity and potential merge conflicts.
7. **[NIT]** The plan should clarify the choice of using either a boolean marker or a source value to
   distinguish the empty "not enough signal yet" brief. This decision impacts how the client renders
   the brief and should be clearly documented.

> Overall verdict: "the plan is well-structured but requires addressing the noted blockers and
> should-fix items to ensure robust implementation and compliance with the spec."

## Triage (author response)

| # | Verdict | Disposition |
|---|---------|-------------|
| 3 | SHOULD-FIX | **Accepted — real gap.** AC-5 truncates in fixed order but never drops `intent`/`blast.summary`; if those alone exceed 8K the ≤8K invariant (AC-4) isn't guaranteed. **Fix applied:** PLAN-02 Task 3 now specifies a final hard-clamp of the never-dropped fields (character-budget truncation of `intent` text / `blast.summary`) as a last resort so ≤8K always holds and the request still never fails. |
| 1 | BLOCKER | **Partially covered — clarified.** The plan already delegates fencing to Task 4 (`wrapUntrusted` under `INJECTION_GUARD`) and has Task 3 only *structure* inputs. **Fix applied:** Task 3 note now states it must keep each untrusted input as a **discrete field** (never concatenate untrusted text into a trusted string), so Task 4's per-field fencing can't be defeated. |
| 2 | BLOCKER | **Already covered.** D7 / Task 6 / Recommendations already fix the in-flight lock as **in-process** and explicitly document the single-node assumption (AGENTS: "API and web run on the host") with a comment to revisit for multi-node. No change; the reviewer restated an already-recorded decision. |
| 4 | SHOULD-FIX | **Already covered.** The AC-3b zero-call empty-brief path is tested in Task 6 acceptance test **(f)** ("a fully-empty PR returns the empty brief with zero calls") and Task 3 test **(c)** (empty predicate trips). No change. |
| 5 | SHOULD-FIX | **Already covered.** Task 2 requires filtering **every** cache read by `workspace_id` (tenant safety, server INSIGHTS 2026-06-29); the cache key is workspace+PR (AC-14). No change. |
| 6 | NIT | **Agreed.** Matches the planner's own recommendation; execution mode for this run is **single-agent sequential** (Sonnet + protected context window). |
| 7 | NIT | **Already covered.** Recommendations already propose an explicit `materialized: boolean` marker orthogonal to `source: 'fresh'|'cache'`. No change. |

**Net effect:** one genuine gap (#3) and one useful clarification (#1) were folded into PLAN-02 Task 3;
the remaining five were already addressed in the plan or its recorded decisions. Verdict accepted; plan
proceeds to `/implement`.
