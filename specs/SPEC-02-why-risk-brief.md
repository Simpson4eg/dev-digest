---
module: cross-cutting
created: 2026-07-11
---

# Spec: Why + Risk Brief  |  Spec ID: SPEC-02  |  Status: approved
Supersedes: —

Approved 2026-07-11. The four open questions raised in the draft were resolved by the
user into decisions D5–D8 below (empty-input → zero calls; new-head → "outdated" badge;
single in-flight regenerate lock; `review_focus` targets file+line/symbol).

## Problem & why

A reviewer opening a PR page today has to assemble the "should I worry about this?" picture
by hand: read the derived intent, scan the blast radius, eyeball the smart-diff groups, and
cross-reference the linked issue. Each of those artifacts already exists and is deterministic
(L03 intent, L03 smart-diff, L04 blast radius, SPEC-01 project context), but there is no single
compact answer to **what this PR does, why, how risky it is, and where to look first**.

This feature adds a compact **Why + Risk Brief** card to the PR page. The design payoff is that
it is *nearly free*: it is built by **assembling artifacts that already exist** and spending
**exactly one** new structured LLM call to compose them into a thin, human-facing `Brief`. The
brief is cached per PR, so the normal act of reopening a PR costs zero LLM calls; only an
explicit "regenerate" spends the call again.

The brief must be **grounded** the same way findings are (`reviewer-core/docs/grounding-gate.md`):
every risk and every "review focus" item points at a **real file/endpoint** that is present in
the assembled inputs. A risk pointing at a file the model invented is invalid and dropped — the
card never sends a reviewer to a file that isn't in the blast/smart-diff evidence.

## Goals / Non-goals

**Goals**

- **Backend route `POST /pulls/:id/brief`** that assembles its LLM input **only** from
  already-built deterministic artifacts and makes **exactly one** structured LLM call producing a
  new thin `Brief`.
- **Deterministic input assembly** from: derived intent (`Intent`, L03 —
  `reviewer-core/src/review/intent.ts`), blast-radius summary (`BlastRadius`, L04 —
  `server/src/modules/blast/service.ts`), diff-stats-by-group (`SmartDiff`, L03 —
  `server/src/modules/smart-diff/service.ts`), the linked issue (if any), and the relevant
  attached Project Context specs resolved via the SPEC-01 mechanism
  (`server/src/modules/reviews/project-context.ts` + `run-executor.ts:238-275`). The route
  **must not** receive or read raw diff / changed-line bodies.
- **≤ 8K-token input budget.** The assembled LLM input stays at or under 8,000 tokens as counted
  by the server tokenizer (`container.tokenizer.count`, `server/src/platform/container.ts:140-143`);
  the assembly is designed to respect it and to degrade predictably on overflow (see D3 / AC-4).
- **The thin `Brief` artifact** `{ what, why, risk_level, risks[], review_focus[] }`, distinct from
  and composed on top of the existing deterministic `PrBrief` composite (see D1). Each `risks[]`
  and `review_focus[]` entry references a real file/endpoint traceable to the assembled inputs.
- **Grounding gate for the brief:** any `risks[].file_refs` entry or `review_focus[]` target not
  present in the assembled blast/smart-diff file/endpoint set is **dropped** before the brief is
  cached and returned (mirrors the findings grounding gate).
- **Per-PR cache:** the brief is cached per PR; reopening the PR serves from cache with **no** new
  LLM call; a **regenerate** action invalidates the cache and forces a fresh single call.
- **UI component `PrBriefCard`** on the PR page: risk level shown by color, and a `review_focus`
  list whose items are links that navigate into the file/code (anchored to the blast `ref` sha
  where relevant, mirroring `BlastRadiusPanel`).
- **Observability:** the assembled-input token size for the brief call is inspectable so ≤8K can
  be verified, and a cache-hit vs. fresh-call is distinguishable from the call log.

**Non-goals** (explicitly out of scope for this spec)

- **Renaming or replacing the existing deterministic contracts.** The existing `Intent`,
  `BlastRadius`, `Risk`, `SmartDiff`, `PrHistory`, and the composed `PrBrief`
  (`server/src/vendor/shared/contracts/brief.ts`) are **not** renamed or restructured. In
  particular the `Intent.intent` field is **not** renamed to `summary` — there is a
  DB-migration warning on it (`brief.ts:9-15`). The new `Brief` lives **beside** `PrBrief`, not
  in place of it (D1).
- **A second LLM call for anything** — grounding, citation-checking, translation, or history.
  The brief is exactly one structured call; grounding is mechanical, not LLM-checked (mirrors
  `reviewer-core/docs/grounding-gate.md:24-30`).
- **"WhyTimeline" / history-of-briefs across PR commits** — a stretch feature (a brief per PR
  head over time). Explicitly deferred; not built here.
- **Reading or embedding raw diff bodies** into the brief input. The brief consumes only the
  deterministic *summaries* (intent, blast summary, per-group diff stats), never changed-line
  text.
- **Seeding and the demo video.** Generating a brief on a real PR and clicking a risk through to a
  real file is a **manual verification step**, not an automated AC (mirrors SPEC-01's
  LLM-behaviour-demo note).

## User stories

- As a **reviewer**, I want a one-glance brief of what a PR does, why, and how risky it is, so I
  can decide how much scrutiny it needs before I open the diff.
- As a **reviewer**, I want the brief's risks and "review focus" items to be **clickable links to
  the actual files/endpoints**, so I jump straight to the code that matters instead of hunting.
- As a **reviewer**, I want reopening a PR to show the brief instantly with **no** LLM cost, and a
  **regenerate** button when the PR has changed, so the feature is cheap by default but refreshable
  on demand.
- As a **studio operator**, I want the assembled brief input to be **capped and inspectable
  (≤8K tokens)** and the call to be **exactly one**, so the LLM-call budget of this feature is
  provable, not assumed.
- As a **studio operator**, I want a risk that points at a file **not** in the PR's blast/smart-diff
  evidence to be **dropped**, so the card can never send a reviewer to a hallucinated file.

## Acceptance criteria (EARS)

Input assembly (deterministic, no raw diff)

- **AC-1** — WHEN `POST /pulls/:id/brief` assembles the LLM input, the system shall build it
  **only** from the deterministic artifacts — derived `Intent`, `BlastRadius` (its `summary`,
  `changed_symbols`, `downstream` callers, `endpoints_affected`, `crons_affected`, `prior_prs`,
  and `ref`), `SmartDiff` per-group diff stats (path + role + additions/deletions/finding_lines),
  the linked issue text (if any), and the resolved Project Context spec texts — and shall **not**
  read or include any raw diff body or changed-line text.
- **AC-2** — WHEN the brief input is assembled, the system shall resolve the relevant attached
  Project Context specs through the SPEC-01 effective-set mechanism
  (`resolveEffectiveSet` → `filterContextPaths` → read, per `run-executor.ts:238-275`), such that
  only `.md` files under the configured context folders are included and non-context paths are
  skipped (inherits SPEC-01 AC / the run-time path gate).
- **AC-3** — WHERE any input artifact is absent (no derived intent yet, blast degraded / `no_data`,
  no latest review so smart-diff has no finding overlay, or no linked issue), the system shall omit
  that section from the assembled input and still produce a brief from the remaining artifacts —
  a missing artifact shall not fail the request.
- **AC-3b** — WHERE the input set is **fully empty** (no derived intent, blast `degraded`/`no_data`,
  no smart-diff finding overlay, and no linked issue), the system shall make **zero** LLM calls and
  return an **empty "not enough signal yet" brief** (empty `risks[]` / `review_focus[]`, a neutral
  `risk_level`, and a marker distinguishing it from a materialized brief); `PrBriefCard` shall render
  a "not enough signal yet" empty state (D5). The one LLM call is spent only when at least one
  substantive artifact is present.

Token budget (≤8K) + overflow

- **AC-4** — WHEN the brief input is assembled, its size as counted by the server tokenizer
  (`container.tokenizer.count`) shall be **≤ 8,000 tokens** before the LLM call is made.
- **AC-5** — IF the assembled input would exceed 8,000 tokens, THEN the system shall **truncate in
  a fixed priority order** and re-measure until it fits, dropping lowest-value context first:
  (1) Project Context spec texts, then (2) `prior_prs`, then (3) `downstream` callers beyond the
  top-N by caller count, then (4) `SmartDiff` `boilerplate`-group file rows — while **never**
  dropping the derived `intent` text or the `blast.summary` (D3). The request shall not fail on
  overflow; it shall shrink and proceed.

Single-call boundary (server assembles → reviewer-core composes)

- **AC-6** — WHEN a fresh brief is produced, the server shall assemble the input and invoke the
  reviewer-core structured path (`completeStructured`, `reviewer-core/src/llm/openrouter.ts:63`)
  **exactly once**, producing a `Brief`; the feature shall make **zero** additional LLM calls per
  fresh brief (no separate grounding, citation-check, or translation call).
- **AC-7** — WHEN the server composes the brief, the composition step shall run in reviewer-core
  and remain **pure** (no DB / GitHub / fs) — the server assembles the deterministic inputs and
  passes them in, and reviewer-core returns the parsed `Brief` (mirrors the intent-layer boundary,
  `reviewer-core/src/review/intent.ts:126-162`).

Grounding (drop ungrounded risks / focus)

- **AC-8** — WHEN the model returns a `Brief`, the system shall drop any `risks[]` entry whose
  every `file_refs` path is **absent** from the set of files/endpoints present in the assembled
  blast + smart-diff inputs, before the brief is cached or returned (a risk survives if **at least
  one** of its `file_refs` matches, mirroring `docs/grounding-gate.md:13-14`).
- **AC-9** — WHEN the model returns a `Brief`, the system shall drop any `review_focus[]` entry
  whose target is **absent** from the assembled blast + smart-diff input set, before the brief is
  cached or returned. A `review_focus[]` target is a **file + line/symbol** location (not a bare
  file), so it can deep-link to a specific place (D8); grounding matches on the file/endpoint being
  present in the evidence, and the line/symbol is carried through for the click-to-code anchor.
- **AC-10** — WHERE a surviving `risks[].file_refs` / `review_focus[]` target maps to a caller
  file, the stored brief shall carry the blast `ref` sha so the client can anchor the click-to-code
  link to the indexed commit, not the PR head (mirrors `BlastRadiusPanel` `blast?.ref ?? headSha`,
  `client/.../BlastRadiusPanel.tsx:120-122`).

Per-PR cache

- **AC-11** — WHEN `POST /pulls/:id/brief` is called and a cached brief exists for that PR and has
  not been invalidated, the system shall return the cached brief and make **zero** LLM calls.
- **AC-12** — WHEN a PR page is reopened, the cached brief shall be served with **no** new LLM call
  (verifiable from the call log — a reopen adds no brief call).
- **AC-13** — WHEN the user triggers **regenerate**, the system shall invalidate the PR's cached
  brief and make **exactly one** fresh LLM call, replacing the cached brief with the new result.
- **AC-13b** — WHILE a fresh brief call for a PR is in flight, a second regenerate for the **same
  PR** shall **join the in-flight call** rather than start a second one — a **single in-flight lock
  per PR** — so two overlapping regenerates cost **one** LLM call, not two (D7).
- **AC-14** — The brief cache key shall be **per PR** (scoped by workspace + PR id); a brief cached
  for one PR shall never be served for a different PR.
- **AC-14b** — WHEN a brief is materialized, the system shall record the PR **head sha** it was built
  against. WHEN a cached brief is served and the PR's current head sha differs from the recorded one,
  the response/card shall be marked **`outdated`** — the cache is **not** auto-invalidated and **no**
  LLM call is made; the reviewer sees an "outdated — regenerate" badge and chooses whether to spend a
  call (D6). Reopen with an unchanged head serves the cache with no badge and no call (AC-12).

Risk level + UI

- **AC-15** — The `Brief.risk_level` shall be one of a fixed, enumerated set reusing the existing
  `RiskSeverity` values `high | medium | low` (`brief.ts:93`) — the brief shall not introduce a
  new, divergent risk vocabulary (D2).
- **AC-16** — WHEN `PrBriefCard` renders a brief, it shall map `risk_level` to a color
  (high/medium/low → a distinct color each) and render `review_focus[]` items as links that
  navigate to the referenced **file at its line/symbol** (D8), each link anchored to the brief's
  stored `ref` sha where present (else the PR head sha).
- **AC-16b** — WHEN a served brief is marked `outdated` (AC-14b) or is the empty "not enough signal
  yet" brief (AC-3b), `PrBriefCard` shall render the corresponding state — an "outdated — regenerate"
  badge, or the empty state — rather than presenting a stale/empty brief as current.

Observability

- **AC-17** — WHEN a fresh brief is produced, the system shall record the assembled-input token
  count (per `container.tokenizer.count`) so an operator can verify the ≤8,000 budget (AC-4) after
  the fact.
- **AC-18** — The brief record / response shall distinguish a **cache hit** from a **fresh call**
  (e.g. a `source: 'cache' | 'fresh'` marker or equivalent), so AC-11/AC-12 (no-LLM-on-reopen) is
  verifiable without reading provider logs.

## Edge cases

- **No derived intent yet / blast degraded / no prior review.** Each input is optional; the brief
  is built from whatever deterministic artifacts exist (AC-3). A **fully-empty** input set (brand-new
  PR, nothing indexed) makes **zero** LLM calls and returns the empty "not enough signal yet" brief
  (AC-3b / D5).
- **Oversized input.** A large linked issue, many attached specs, or a wide blast radius can blow
  the 8K budget → fixed-priority truncation (AC-5), never a failed request. Truncation is
  deterministic so two assemblies of the same PR state produce the same input.
- **Model returns a risk citing a file not in the inputs.** Dropped by the grounding gate (AC-8);
  a brief with all risks dropped is still a valid brief (empty `risks[]`, mirroring the empty-
  findings case in `docs/grounding-gate.md:41-42`).
- **Model returns a `review_focus` target outside the evidence.** Dropped (AC-9).
- **Moved/renamed file between indexed sha and PR head.** Click-to-code anchors to `blast.ref`
  (AC-10); when the repo isn't indexed (`ref` absent), the client falls back to the PR head sha
  (`brief.ts:83-88`).
- **Regenerate mid-flight / concurrent regenerate.** A second regenerate for the same PR while a
  call is in flight **joins** the in-flight call — a single in-flight lock per PR (AC-13b / D7) — so
  two overlapping regenerates cost one LLM call, and the cache is never corrupted by two writers.
- **PR gets a new commit (new head sha) after the brief was cached.** The cache is not
  auto-invalidated; the served brief is marked `outdated` and the card shows an "outdated —
  regenerate" badge, with no LLM call until the reviewer regenerates (AC-14b / D6).
- **Linked issue absent.** Section omitted (AC-3); not an error.
- **Empty `risks[]` and empty `review_focus[]`.** Valid; the card renders a low-risk / "nothing to
  focus on" state rather than an error.

## Non-functional

- **Security / untrusted content.** The brief's inputs derived from the PR are
  **attacker-influenceable**: the derived `intent` text (reconstructed from the author-controlled
  description), the linked issue body, and the attached Project Context spec texts. All of these
  shall be handled as **data, not instructions** — routed through `wrapUntrusted` under the shared
  `INJECTION_GUARD` (`reviewer-core/src/prompt.ts:16-44`), exactly as SPEC-01 and the intent layer
  do (`intent.ts:16-17`, and the `specs` slot at `prompt.ts:133-136,153`). The blast/smart-diff
  summaries are repo-derived and likewise wrapped. A spec or issue body containing "ignore previous
  instructions" / "SYSTEM:" must not alter the brief. Do **not** add keyword/denylist scanning —
  the guard is the defence (reviewer-core AGENTS: "Injection defense is `INJECTION_GUARD`, not
  keyword scanning").
- **Boundary contract (what, not how).** The new `Brief` shape crosses the
  reviewer-core → server → client boundary. Its source of truth is the Zod contracts in
  `server/src/vendor/shared/contracts/` (see the `zod` skill for vocabulary). `Brief` reuses
  `RiskSeverity` for `risk_level` (D2) and reuses `Risk`'s `file_refs` idea for grounding, but it
  is a **new, thinner** artifact `{ what, why, risk_level, risks[], review_focus[] }` distinct from
  the deterministic composite `PrBrief` (`brief.ts:161-168`). This spec fixes the *what* (the field
  set, the enum reuse, the grounding invariant); the exact Zod authoring, the cache table/DDL, and
  the field-level shape are the implementer's job — no Zod code here.
- **Performance / budget.** One structured LLM call per fresh brief; zero on cache hit. Assembled
  input ≤ 8,000 tokens (AC-4). Assembly, tokenization, truncation, and grounding are deterministic
  and non-LLM.
- **a11y.** `PrBriefCard`'s risk-level color shall not be the *only* signal — the level shall also
  be conveyed textually (a label), so color-blind users get the risk level; focus-list links shall
  be keyboard-navigable.
- **Observability / demo (manual, not a pass/fail AC).** The L05 payoff — generate a brief on a
  real PR and confirm each risk / focus item links to a **real** file that opens at the right
  place — is a **manual verification / demo step**, because it depends on LLM behaviour. It is out
  of scope for automated ACs; AC-1…AC-18 cover only the deterministic mechanics (assembly, budget,
  single-call boundary, grounding, cache, wiring) that make the demo possible.

## Inputs (provenance)

- **Derived PR intent** (`Intent`) — `[reused: L03]` (the intent layer's structured artifact,
  `reviewer-core/src/review/intent.ts`; itself one prior LLM call, not re-run here).
- **Blast radius** (`BlastRadius`, incl. `summary`, callers, endpoints, crons, `prior_prs`, `ref`)
  — `[deterministic: repo-intel]` (read straight from the index by `BlastService`,
  `server/src/modules/blast/service.ts` — zero LLM).
- **Smart-diff per-group stats** (`SmartDiff` groups + finding_lines) —
  `[deterministic: repo-intel]` (composed deterministically from PR files + latest review findings,
  `server/src/modules/smart-diff/service.ts` — zero LLM).
- **Linked issue text (if any)** — `[deterministic: repo-intel]` (first-party issue record; its
  body is untrusted content — see below).
- **Attached Project Context spec texts** — `[reused: L05 / SPEC-01]` (resolved via
  `resolveEffectiveSet` + `filterContextPaths`, read at request time; untrusted content).
- **Per-PR cached brief** — `[deterministic: repo-intel]` (served on cache hit with no LLM call).
- **Assembled-input token count** — `[deterministic: repo-intel]` (`container.tokenizer.count`).
- **The brief composition** — `[new: 1 LLM call]`. **Exactly one** structured call per *fresh*
  brief (AC-6); zero on cache hit (AC-11) and one on regenerate (AC-13). No additional LLM call for
  grounding, citation-checking, or translation — grounding is mechanical (AC-8/AC-9).

## Untrusted inputs

**Present.** Three inputs are attacker-influenceable and must be handled as **data, not commands**:

1. **Derived `intent` text** — reconstructed from the author-controlled PR title/description; a
   prime injection vector (already noted at `reviewer-core/src/prompt.ts:79-86`, `intent.ts:16`).
2. **Linked issue body** — author/community-authored text.
3. **Attached Project Context spec texts** — repo `.md` files editable via a PR (the same
   untrusted surface SPEC-01 hardens).

All three shall be rendered only inside `wrapUntrusted` fences under the shared `INJECTION_GUARD`
(`reviewer-core/src/prompt.ts:16-44`), never as instructions, with no untrusted text embedded in
the trusted system prompt of the brief call. The remaining inputs — blast/smart-diff summaries
(repo-derived, still wrapped as untrusted per the existing convention), tokenizer counts, cache
records — carry no additional trust: the blast/smart-diff summaries are also wrapped, and only the
first-party control fields (workspace/PR ids, `ref` sha, token counts) are trusted.

## Resolved decisions

Because this spec is authored headless (no interactive interview), the following were decided on
the lab's stated defaults. Any that would change the design if wrong are also surfaced as
`OPEN QUESTION` items to the user.

1. **New `Brief` vs. existing `PrBrief` (D1).** The thin `Brief { what, why, risk_level, risks[],
   review_focus[] }` is a **new artifact that lives beside** the existing deterministic composite
   `PrBrief` (`brief.ts:161-168`); it **consumes** `Intent` / `BlastRadius` / `SmartDiff` as inputs
   but does **not** replace or restructure them, and does **not** rename any existing contract
   (notably not the `Intent.intent` → `summary` rename the file warns against at `brief.ts:9-15`).
   `Brief` is the LLM-composed, human-facing card; `PrBrief` remains the deterministic composite.
2. **`risk_level` vocabulary (D2).** Reuse the existing `RiskSeverity` enum values
   `high | medium | low` (`brief.ts:93`) for `Brief.risk_level` rather than inventing a parallel
   scale — this keeps the card's color mapping and any future filtering consistent with `Risk`.
3. **≤8K overflow strategy (D3).** On overflow, truncate in a **fixed priority order** — Project
   Context specs → `prior_prs` → `downstream` callers beyond top-N → `boilerplate` smart-diff rows
   — re-measuring after each drop, and **never** dropping the `intent` text or `blast.summary`
   (AC-5). Deterministic, so identical PR state yields identical assembled input.
4. **Cache scope (D4).** Cache key is **per PR** (workspace + PR id), not per PR-head-sha. A brief
   is invalidated only by explicit **regenerate** (AC-13), not automatically on a new PR commit.
5. **Empty-input behaviour (D5, user-decided 2026-07-11).** A fully-empty input set makes **zero**
   LLM calls and returns an empty "not enough signal yet" brief (AC-3b); the one call is spent only
   when a substantive artifact exists.
6. **New-head staleness (D6, user-decided 2026-07-11).** The brief records the head sha it was built
   against; on a newer head the cached brief is served **marked `outdated`** with an
   "outdated — regenerate" badge and **no** auto-call (AC-14b) — not auto-invalidated. Full
   brief-per-head history remains the deferred WhyTimeline non-goal.
7. **Regenerate concurrency (D7, user-decided 2026-07-11).** A **single in-flight lock per PR**:
   overlapping regenerates join one call, costing one LLM call, never two (AC-13b).
8. **`review_focus` granularity (D8, user-decided 2026-07-11).** A focus target is a **file +
   line/symbol** location (AC-9/AC-16), so the click lands on the specific place (matching the design
   mockup's `path:line — reason` rows); grounding matches on the file/endpoint presence in evidence.
