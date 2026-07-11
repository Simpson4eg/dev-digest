import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
// Note: the lab spec calls this field "summary"; we use "intent" for internal
// consistency. Do NOT rename without a DB migration on the pr_intent table.
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

/**
 * Index health for the blast read. Mirrors repo-intel's DegradedReason so the UI
 * can show an honest "index still building / repo too large" badge instead of a
 * blank panel. Enriched by the service (never the repo), so both are `.optional()`.
 */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

/**
 * An earlier MERGED PR that touched at least one of the files this PR changes —
 * "who last touched this code". Derived zero-LLM from `pull_requests` +
 * `pr_files` (merged_at IS NOT NULL, overlapping paths), newest merge first.
 */
export const PriorPr = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  author: z.string(),
  /** ISO-8601 merge timestamp. */
  merged_at: z.string(),
  /** Which of the current PR's files this prior PR also touched. */
  files_overlap: z.array(z.string()),
});
export type PriorPr = z.infer<typeof PriorPr>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  degraded: z.boolean().optional(),
  reason: BlastDegradedReason.optional(),
  /**
   * Earlier merged PRs overlapping the changed files (recency-ordered). Omitted
   * when none overlap or the PR has no changed files — never LLM-derived.
   */
  prior_prs: z.array(PriorPr).optional(),
  /**
   * The commit the caller data was indexed at (`repo_index_state.last_indexed_sha`).
   * Caller file:line come from THIS snapshot, so click-to-code must anchor links
   * here — not the PR head, whose moved/renamed files would 404. Omitted when the
   * repo isn't indexed yet (client falls back to the PR head sha).
   */
  ref: z.string().optional(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;

// ---- Why + Risk Brief (LLM-composed, one call per fresh brief) ----
// New thin LLM-facing artifact. Lives BESIDE PrBrief — does NOT replace it (D1).
// Do NOT rename PrBrief or any existing contract above.

// File + line/symbol location so the card can deep-link to a specific place (D8, AC-9).
// Grounding (T5) matches on file presence in evidence; line/symbol carried through for
// the click-to-code anchor. At least one of line/symbol should be present for useful anchors.
export const ReviewFocus = z.object({
  file: z.string(),
  line: z.number().int().nullish(),
  symbol: z.string().nullish(),
  reason: z.string(),
});
export type ReviewFocus = z.infer<typeof ReviewFocus>;

// Thinner bespoke risk shape for the brief (no `kind` field — that is a finding-category
// marker not relevant to the brief card). Keeps file_refs + severity: RiskSeverity so the
// grounding gate (T5, AC-8) and the risk-level color map (T8) have exactly what they need.
// Choice rationale: Risk (brief.ts:96-103) includes `kind` which is a finding classifier;
// BriefRisk omits it intentionally. Both `file_refs` and `severity` are preserved verbatim.
export const BriefRisk = z.object({
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type BriefRisk = z.infer<typeof BriefRisk>;

// Distinguishes cache hit vs fresh call (AC-18). Orthogonal to `materialized`.
export const BriefSource = z.enum(['fresh', 'cache']);
export type BriefSource = z.infer<typeof BriefSource>;

// The LLM-composed human-facing brief. risk_level REUSES RiskSeverity (brief.ts:93),
// no new vocabulary (D2, AC-15).
export const Brief = z.object({
  what: z.string(),
  why: z.string(),
  risk_level: RiskSeverity,
  risks: z.array(BriefRisk),
  review_focus: z.array(ReviewFocus),
});
export type Brief = z.infer<typeof Brief>;

// Response/record wrapper. Fields the repo layer cannot fill are .nullable().optional()
// per the INSIGHTS 2026-06-20 precedent (trace.ts:94-114).
// `materialized` is an ORTHOGONAL flag to `source` (plan Recommendations):
//   - source: 'cache' | 'fresh'  answers "where did this come from?" (AC-18)
//   - materialized: boolean       answers "was there enough signal for an LLM call?" (AC-3b)
//   A served empty brief (AC-3b) has materialized=false; a cached or fresh brief has materialized=true.
export const BriefResponse = Brief.extend({
  // blast ref sha so the client can anchor caller-file links to the indexed commit (AC-10).
  ref: z.string().nullable().optional(),
  // The PR head sha the brief was built against (AC-14b outdated detection).
  built_head_sha: z.string().nullable().optional(),
  // True when the served brief was built at an older head sha than the PR's current head (AC-14b).
  outdated: z.boolean().nullable().optional(),
  // Cache hit vs fresh call (AC-18).
  source: BriefSource.nullable().optional(),
  // Assembled-input token count so the <=8K budget is verifiable after the fact (AC-17).
  input_tokens: z.number().int().nullable().optional(),
  // True if the brief was produced from a substantive LLM call; false for the empty
  // "not enough signal yet" brief (AC-3b). Orthogonal to source.
  materialized: z.boolean(),
});
export type BriefResponse = z.infer<typeof BriefResponse>;
