---
module: cross-cutting
created: 2026-07-10
---

# Spec: Project Context  |  Spec ID: SPEC-01  |  Status: implemented
Supersedes: —

## Problem & why

Today a spec, PRD, or insights doc in the repo is a document *for humans*. The review
agents never read it, so a reviewer cannot enforce a stated invariant (e.g. "`api/` must
not import `db/` directly") even when that rule is written down two folders away. The
prompt already has an empty **`## Project context`** slot scaffolded in L02–L04 — the
untrusted `specs` param on `assemblePrompt` renders it (`reviewer-core/src/prompt.ts:133-136,153`),
and the trace contract already carries `PromptAssembly.specs` (`server/src/vendor/shared/contracts/trace.ts:45`)
and `RunTrace.specs_read: string[]` (`trace.ts:101`) — but both are hard-coded empty in
the executor (`server/src/modules/reviews/run-executor.ts:334`, `:648`).

This feature makes any markdown under a `specs`/`docs`/`insights` folder **attachable
context** for the agents (and skills) it is attached to: a spec stops being a passive
document and starts *steering the reviewer*. It is deliberately the smaller of two SDD
features and the direct payoff for L05 — it fills the already-built slot with zero new
LLM calls. It is also the bridge to L06: here the reviewer merely *reads* the attached
spec; a later feature adds a dedicated agent that compares an implementation against a
spec and blocks merge on divergence.

## Goals / Non-goals

**Goals**
- **Reader (server):** recursively discover, in the cloned repo, every `.md` file under
  a folder named `specs`, `docs`, or `insights` at any depth (glob
  `**/{specs,docs,insights}/**/*.md`), the folder-name list taken from config; surface
  each with its repo-relative path on a **Project Context** screen.
- **Manual attach — two levels:** an agent may attach documents directly (Agent editor ▸
  **Context** tab, ordered/reorderable); a skill may attach documents (Skill editor ▸
  **"Project context to use"**), which every agent using that skill inherits.
- **Storage:** persist only the **paths** (not the document text) in the agent's / skill's
  metadata.
- **Read-at-run injection:** on a run, the run-executor resolves the effective document
  set → reads the files → renders them into the single untrusted `## Project context`
  prompt slot, before the prompt is sent to the LLM. Zero new LLM calls — reading files
  is deterministic I/O.
- **Observability:** the run trace shows which documents were injected (populating
  `specs_read[]`) and each one's size in tokens.

**Non-goals** (explicitly out of scope for this spec)
- **Auto-selection ("flash-selector").** Auto-picking specs per-PR is a complex mechanism
  and is deferred. This feature is **manual attach only**.
- **Embedding / chunking / coverage.** Chunking attached docs into pgvector and any
  "coverage" metric are deferred *together with* auto-select. The design mockup's
  "Indexed: 12 files · 1,240 chunks · last 5m ago" footer and the "78 COVERAGE" ring
  belong to that future feature and are **not** built here. The existing `code_chunks`
  pgvector table (`server/src/db/schema/context.ts`) is repo-intel's, not this feature's.
- **Editing the attached documents** from the Project Context screen. A Preview (and an
  Edit toggle shown in the mockup) may render markdown, but authoring/writing doc files is
  out of scope for this spec.
- **A dedicated conformance/gate agent** that blocks merge on spec divergence — that is
  the L06 follow-up feature, not this one.

## User stories

- As a **reviewer-agent author**, I want to attach a spec to my agent so that the agent
  reads that spec on every run and can flag code that violates it, citing the spec.
- As a **skill author**, I want to attach a shared rubric doc to a skill so that every
  agent enabling that skill inherits the doc without re-attaching it per agent.
- As a **studio operator**, I want the run trace to list exactly which documents were
  injected and their token sizes so that the injected context is visible, not guessed.
- As a **studio operator**, I want a moved/deleted attached doc to be skipped and surfaced
  rather than fail the whole run, so that a stale attachment never breaks reviews.

## Acceptance criteria (EARS)

Reader / discovery
- **AC-1** — WHEN the Project Context screen is opened for a cloned repo, the server shall
  return every `.md` file whose repo-relative path contains a path segment named `specs`,
  `docs`, or `insights` (glob `**/{specs,docs,insights}/**/*.md`), at any depth, each with
  its repo-relative path.
- **AC-2** — The set of root folder-names matched by the reader (`specs`, `docs`,
  `insights`) shall be read from config, not hard-coded at the call site.
- **AC-3** — WHERE the repo contains no `specs`/`docs`/`insights` folder (or none with any
  `.md` file), the reader shall return an empty list and the Project Context screen shall
  render an empty state (no error).

Attach / detach persistence
- **AC-4** — WHEN a user attaches a document to an agent in the Context tab, the system
  shall persist only the document's repo-relative **path** (not its text) in the agent's
  metadata, and the attachment shall survive a reload.
- **AC-5** — WHEN a user attaches a document to a skill, the system shall persist only the
  **path** in the skill's metadata, and the attachment shall survive a reload.
- **AC-6** — WHEN a user reorders the documents attached to an agent, the system shall
  persist the new order, and a later run shall render the documents in that stored order
  (earlier-listed documents appear earlier in the assembled block).
- **AC-7** — WHEN a user detaches a document, the system shall remove that path from the
  agent's / skill's metadata, and a subsequent run shall not read or inject it.

Effective set (merge / dedup / disabled skills)
- **AC-8** — WHEN an agent runs, the system shall compute its effective document set as the
  union of documents attached directly to the agent and documents inherited from its
  **enabled** skills, and shall render them in a single `## Project context` block ordered
  agent-attached documents first (in their stored order) then skill-inherited documents
  (in order).
- **AC-9** — IF the same document path is reachable both directly on the agent and via one
  of its skills, THEN the assembled block shall include that document exactly once (deduped
  by repo-relative path), in its agent-attached position.
- **AC-10** — WHILE a skill is globally disabled, the documents it would contribute shall
  not appear in the effective set (mirroring the enabled-skill filter at
  `server/src/modules/reviews/run-executor.ts:192-203`).

Injection into the prompt
- **AC-11** — WHEN an agent with a non-empty effective document set runs, the run-executor
  shall read each document's file content and pass it into `reviewPullRequest` such that it
  renders in the existing untrusted `## Project context` slot
  (`reviewer-core/src/prompt.ts:153`), each document wrapped by `wrapUntrusted`
  (`prompt.ts:40-44`) — no document text embedded in the stored prompt template.
- **AC-12** — WHERE an agent's effective document set is empty, the `## Project context`
  slot shall be omitted entirely, producing a prompt byte-identical to today's
  (no-project-context) prompt for that agent.
- **AC-13** — The Project Context feature shall make **zero** new LLM calls; document
  resolution, reading, and token counting shall be deterministic I/O only.

Trace / observability
- **AC-14** — WHEN a run completes, its trace shall populate `RunTrace.specs_read`
  (`server/src/vendor/shared/contracts/trace.ts:101`) with the repo-relative path of every
  document that was actually read and injected (replacing the current hard-coded `[]` at
  `run-executor.ts:334`).
- **AC-15** — WHEN a run completes, the trace shall expose, for each injected document, its
  size in tokens as counted by the server tokenizer (`container.tokenizer.count`, per the
  `skill_tokens` precedent at `run-executor.ts:322-324`).

Failure handling (never fail the run)
- **AC-16** — IF an attached document's path is missing, moved, deleted, or unreadable at
  run time, THEN the run-executor shall skip that document, surface a line in the Live Log,
  and continue the run — the document shall not appear in `specs_read[]` and the run shall
  not fail (mirroring the best-effort, omit-when-empty, never-fail slots at
  `run-executor.ts:231-260`).

## Edge cases

- **Path resolved at run-time, not attach-time.** Paths are stored at attach-time and read
  at run-time; a doc valid at attach can be gone at run → AC-16 (skip + surface, never
  fail).
- **Doc attached via both agent and one of its skills** → included once, deduped by path,
  in its agent-attached position (AC-9).
- **A context-contributing skill is globally disabled** → contributes nothing (AC-10).
- **Empty repo** — no `specs`/`docs`/`insights` folders → reader returns empty, screen
  shows empty state (AC-3). **Agent with zero attached docs** → `## Project context` slot
  omitted, prompt byte-identical to today (AC-12).
- **Oversized single document / large aggregate.** A very large attached doc, or many docs
  in aggregate, can blow the token budget. Reader I/O and token counting must not crash on
  large files. **Decision (D1):** no cap — inject all attached docs and *report* each one's
  size (AC-15) so the risk is visible; the "surface, don't silently reshape" precedent. A
  cap can be added by a later spec if runs prove it necessary.
- **Ordering determinism across the two sources** — agent-attached always before
  skill-inherited; within each source, stored order (AC-8). Two runs of the same agent over
  the same attachments must assemble the block identically.
- **Non-`.md` files / files outside the three folder names** — never discovered by the
  reader (AC-1), so never attachable.
- **Path containment / traversal.** Attached paths are read from the cloned repo tree; a
  stored path must not resolve outside the repo root. The adapter-level containment check
  (`SimpleGitClient.readFile` resolve + `startsWith(base + sep)`, per server INSIGHTS
  2026-07-05 at `simple-git.ts:129-137`) is the primary defence and applies here; on
  Windows `path.isAbsolute('/x')` is `false`, so any secondary path guard must also test
  `/^[/\\]/` and `/^[a-zA-Z]:/` (same INSIGHTS note).
- **Symlinked folder named `specs`/`docs`/`insights`** — recursion should not follow
  symlinks out of the repo tree (defence-in-depth for the containment rule above).

## Non-functional

- **Security / untrusted content:** attached documents are repo files whose text is
  attacker-influenceable (a PR can add or edit a `docs/*.md`). Every injected document is
  **data, not instructions** — rendered only inside `wrapUntrusted` fences, guarded by the
  shared `INJECTION_GUARD` (`reviewer-core/src/prompt.ts:16-28,40-44`). A doc containing
  "ignore previous instructions" / "SYSTEM:" must not alter the reviewer's behaviour; apply
  the **`security`** skill's untrusted-input guidance. Do **not** add keyword/denylist
  scanning of doc text — the guard, not pattern-matching, is the defence (per reviewer-core
  AGENTS "Injection defense is `INJECTION_GUARD`, not keyword scanning").
- **Tenant safety:** attachable documents and their persisted paths are scoped to the
  agent's / skill's workspace; skill-inherited reads must filter by `skills.workspace_id`
  (server INSIGHTS 2026-06-29: `agent_skills` has no `workspace_id`, so a foreign skill id
  otherwise leaks cross-workspace prompt context — `service.ts:162`).
- **Observability / demo (manual, not a pass/fail AC):** the L05 payoff — attach a spec
  carrying an invariant ("`api/` must not import `db/` directly") to a reviewer, open a PR
  that violates it, and confirm the reviewer flags the violation citing the spec — is a
  **manual verification / demo step**, because it depends on LLM behaviour. It is out of
  scope for automated ACs; AC-1…AC-16 cover only the deterministic mechanics that make the
  demo possible.
- **Boundary contract (what, not how):** the new document set crosses the
  server → reviewer-core boundary through the existing `specs?: string[]` param of
  `assemblePrompt` / `reviewPullRequest` (`reviewer-core/src/prompt.ts:57,133-136`). No new
  contract shape is required in `reviewer-core`; the trace shape (`PromptAssembly.specs`,
  `RunTrace.specs_read`) already exists in `server/src/vendor/shared/contracts/trace.ts`.
  The attachment-storage shape on the agent/skill side is the implementer's choice — the
  real precedents are the `agent_skills(agent_id, skill_id, order)` join
  (`server/src/db/schema/agents.ts:51-63`) and `skills.evidenceFiles jsonb $type<string[]>()`
  (`server/src/db/schema/skills.ts:19`). This spec fixes only the *what* (paths only,
  ordered, workspace-scoped), not the DDL/migration.

## Inputs (provenance)

- **Repository markdown files** under `specs`/`docs`/`insights` — `[deterministic: repo-intel]`
  (files read from the cloned repo tree; the reader is a filesystem glob, no LLM).
- **Attached document paths** (agent + skill metadata) — `[reused: L02–L04]` (persisted via
  the same attachment pattern as linked skills / `evidenceFiles`; read back at run-time).
- **Enabled-skill filter** — `[reused: L02–L04]` (`run-executor.ts:192-203`).
- **Per-document token counts** — `[deterministic: repo-intel]` (server tokenizer, same
  path as `skill_tokens`).
- **New LLM calls** — `[new: 0 LLM call]`. This feature is deterministic I/O end-to-end.

## Untrusted inputs

**Present.** The attached document text is untrusted — a repo `.md` file is
attacker-influenceable via a PR. It must be handled as **data, not commands**: rendered
only inside `wrapUntrusted` fences under the shared `INJECTION_GUARD`
(`reviewer-core/src/prompt.ts`), never as instructions, with no doc text embedded in the
stored trusted prompt template. All other inputs (attached paths, enabled-skill flags,
tokenizer counts) are first-party.

**Defence-in-depth on stored paths (D3).** Beyond the adapter-level containment check
(`SimpleGitClient.readFile` resolve + `startsWith(base + sep)`), the run-executor forwards a
stored attachment path to `readFile` **only** if it passes `filterContextPaths` — i.e. it is a
`.md` file under one of the configured `specs`/`docs`/`insights` folders. Any stored path
outside that discoverable set (e.g. `.git/config`, `.env`, a source file) is silently skipped
and logged, and never injected. This closes a path where a workspace user could attach an
arbitrary in-repo file and have its contents exfiltrated into the prompt sent to the LLM. The
attach API accepts any path string; this run-time gate — not attach-time validation — is the
enforced boundary.

## Resolved decisions

Both items below were open questions in the `draft`; the user accepted the stated defaults
on approval (2026-07-10). No open `[NEEDS CLARIFICATION]` items remain.

1. **Aggregate token-budget cap → D1: no cap, report-only.** Inject all attached docs and
   report each one's token size (AC-15). No truncation or priority-dropping in this spec; a
   cap may be added by a later spec if runs show it is needed. (Reflected in the "Oversized
   document" edge case above.)
2. **Config scope of the folder-name list → D2: global `AppConfig`.** The
   `specs`/`docs`/`insights` folder-name list is a single global config value (AC-2). A
   per-workspace override is out of scope for this spec.
