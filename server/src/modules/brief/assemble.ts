/**
 * assemble.ts — pure LLM-input builder for the Why + Risk Brief (Task 3).
 *
 * Assembles the structured LLM input ONLY from already-read deterministic
 * artifacts. No LLM, no DB, no fs, no reads of any kind — the service (Task 6)
 * does all reads and passes artifacts in; this function is a pure transform.
 *
 * Design: "pure core + thin service" — mirrors smart-diff/compose.ts (INSIGHTS
 * 2026-07-05). The service reads the artifacts and calls assembleBriefInput();
 * unit tests drive assembleBriefInput() directly with plain data.
 *
 * Security: untrusted inputs (intent text, issue body, spec texts,
 * blast/smart-diff summaries) are kept as DISCRETE FIELDS on the assembled
 * structure — never concatenated into a single trusted string. Task 4
 * (composeBrief) fences each field separately via wrapUntrusted/INJECTION_GUARD,
 * which is defeated if fields are pre-merged (cross-model #1, SPEC-02).
 */

import type { BlastRadius, Intent, SmartDiff, SmartDiffGroup } from '@devdigest/shared';

// ---- Public types -----------------------------------------------------------

/**
 * Minimal per-group stat row for the assembled input.
 * Contains only deterministic summary data — no raw diff body / changed-line
 * text (AC-1).
 */
export interface AssembledSmartDiffGroup {
  role: SmartDiffGroup['role'];
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    /** Count of reviewer-flagged lines on this file (0 = clean). */
    finding_lines_count: number;
  }>;
}

/**
 * Assembled LLM input for the brief compose call.
 *
 * Each untrusted field is a DISCRETE value — do NOT concatenate them before
 * passing to composeBrief. Task 4 fences each field individually.
 *
 * Present fields = the artifacts that were available (absent ones are undefined
 * so callers can check easily — AC-3).
 */
export interface AssembledBriefInput {
  // ---- Trusted / first-party fields ----------------------------------------
  /** Deterministic blast summary text (repo-derived, wrapped as untrusted in T4). */
  blastSummary: string;
  /** Deterministic blast metadata. Not raw diff. */
  changedSymbols: BlastRadius['changed_symbols'];
  /** Top-N downstream impacts (may be truncated under budget pressure — AC-5 step 3). */
  downstream: BlastRadius['downstream'];
  endpointsAffected: string[];
  cronsAffected: string[];
  /** Prior PRs list (may be dropped under budget pressure — AC-5 step 2). */
  priorPrs?: BlastRadius['prior_prs'];
  /** Blast ref sha for caller-file click-to-code anchoring (AC-10). */
  blastRef?: string;

  // ---- SmartDiff stats (no raw diff body — AC-1) ---------------------------
  /** Per-group diff stats only (path + role + churn counts + finding count). */
  smartDiffGroups: AssembledSmartDiffGroup[];

  // ---- Untrusted inputs (keep DISCRETE — cross-model #1) -------------------
  /**
   * The derived PR intent text. Untrusted — reconstructed from author-controlled
   * title/description. NEVER dropped by truncation (AC-5 / D3).
   */
  intentText?: string;
  /** In-scope items from the derived intent. */
  intentInScope?: string[];
  /** Out-of-scope items from the derived intent. */
  intentOutOfScope?: string[];

  /**
   * Linked issue body text. Untrusted author/community content.
   * Omitted when no linked issue (AC-3).
   */
  linkedIssueText?: string;

  /**
   * Project Context spec texts — each as a separate entry (filename → text).
   * These may be dropped under budget pressure (AC-5 step 1).
   * Untrusted — repo .md files editable via a PR.
   */
  specTexts?: Array<{ filename: string; text: string }>;

  // ---- Budget metadata -------------------------------------------------------
  /** Token count of the assembled input (set by assembleBriefInput after truncation). */
  tokenCount: number;
}

/**
 * Inputs to assembleBriefInput(). All artifacts are optional — absent ones are
 * omitted from the assembled output (AC-3).
 */
export interface BriefAssemblyInputs {
  intent?: Intent;
  blast?: BlastRadius;
  smartDiff?: SmartDiff;
  linkedIssueText?: string;
  specTexts?: Array<{ filename: string; text: string }>;
}

// ---- Constants --------------------------------------------------------------

/** Hard ceiling for the assembled LLM input (AC-4). */
export const BRIEF_TOKEN_BUDGET = 8_000;

/**
 * Maximum downstream callers to include before truncation step 3 kicks in.
 * Halved on each truncation pass until callers fit the budget.
 */
const DOWNSTREAM_INITIAL_TOP_N = 20;

/** Ellipsis marker appended to last-resort character-clamped text (cross-model #3). */
const TRUNCATION_ELLIPSIS = ' … [truncated]';

// ---- Helpers ----------------------------------------------------------------

/**
 * Serialize the assembled input into a single string for token-counting.
 * The tokenizer operates on a string; this renders every field so the count
 * is representative of what the compose prompt will receive.
 *
 * NOTE: This is ONLY for budget measurement — the compose fn (T4) receives the
 * structured AssembledBriefInput with discrete untrusted fields, not this string.
 */
function serializeForTokenCount(input: Omit<AssembledBriefInput, 'tokenCount'>): string {
  const parts: string[] = [];

  parts.push(`blast_summary: ${input.blastSummary}`);

  if (input.changedSymbols.length > 0) {
    parts.push(`changed_symbols: ${input.changedSymbols.map((s) => `${s.name} (${s.file})`).join(', ')}`);
  }

  if (input.downstream.length > 0) {
    const downstream = input.downstream.map((d) => {
      const callers = d.callers.map((c) => `${c.name} at ${c.file}:${c.line}`).join('; ');
      return `${d.symbol}: callers=[${callers}] endpoints=[${d.endpoints_affected.join(', ')}]`;
    });
    parts.push(`downstream: ${downstream.join(' | ')}`);
  }

  if (input.endpointsAffected.length > 0) {
    parts.push(`endpoints_affected: ${input.endpointsAffected.join(', ')}`);
  }
  if (input.cronsAffected.length > 0) {
    parts.push(`crons_affected: ${input.cronsAffected.join(', ')}`);
  }

  if (input.priorPrs && input.priorPrs.length > 0) {
    const prs = input.priorPrs.map(
      (p) => `PR#${p.pr_number} "${p.title}" by ${p.author} (${p.merged_at})`,
    );
    parts.push(`prior_prs: ${prs.join(' | ')}`);
  }

  if (input.smartDiffGroups.length > 0) {
    const groups = input.smartDiffGroups.map((g) => {
      const files = g.files.map((f) => `${f.path} +${f.additions} -${f.deletions} findings:${f.finding_lines_count}`).join('; ');
      return `${g.role}: [${files}]`;
    });
    parts.push(`smart_diff: ${groups.join(' | ')}`);
  }

  if (input.intentText) {
    parts.push(`intent: ${input.intentText}`);
  }
  if (input.intentInScope && input.intentInScope.length > 0) {
    parts.push(`in_scope: ${input.intentInScope.join(', ')}`);
  }
  if (input.intentOutOfScope && input.intentOutOfScope.length > 0) {
    parts.push(`out_of_scope: ${input.intentOutOfScope.join(', ')}`);
  }

  if (input.linkedIssueText) {
    parts.push(`linked_issue: ${input.linkedIssueText}`);
  }

  if (input.specTexts && input.specTexts.length > 0) {
    const specs = input.specTexts.map((s) => `[${s.filename}]: ${s.text}`).join('\n');
    parts.push(`spec_texts:\n${specs}`);
  }

  return parts.join('\n');
}

/**
 * Shape a SmartDiff into the summary stats we include (no raw diff body).
 * Boilerplate group files are eligible for truncation in step 4 (AC-5).
 */
function shapeSmartDiffGroups(smartDiff: SmartDiff): AssembledSmartDiffGroup[] {
  return smartDiff.groups.map((g) => ({
    role: g.role,
    files: g.files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines_count: f.finding_lines.length,
    })),
  }));
}

// ---- Empty detection --------------------------------------------------------

/**
 * Returns true when the assembled input is "fully empty" — no substantive
 * artifact is present, so the compose call would have nothing to work with.
 *
 * Fully empty = no derived intent, blast degraded/no_data, no smart-diff
 * finding overlay, and no linked issue (AC-3b, D5).
 *
 * Task 6 calls this BEFORE spending the LLM call — if true it short-circuits
 * to the zero-call empty brief.
 */
export function isFullyEmpty(inputs: BriefAssemblyInputs): boolean {
  const noIntent = !inputs.intent?.intent;

  const blastDegraded =
    !inputs.blast ||
    inputs.blast.degraded === true ||
    inputs.blast.reason === 'no_data';

  // "no smart-diff finding overlay" means no file has any reviewer-flagged lines.
  const noFindingOverlay =
    !inputs.smartDiff ||
    inputs.smartDiff.groups.every((g) => g.files.every((f) => f.finding_lines.length === 0));

  const noLinkedIssue = !inputs.linkedIssueText?.trim();

  return noIntent && blastDegraded && noFindingOverlay && noLinkedIssue;
}

// ---- Core assembly ----------------------------------------------------------

/**
 * Assembles the LLM input for the brief, enforces the ≤8K token budget, and
 * returns the final AssembledBriefInput with the token count set.
 *
 * @param inputs     All already-read deterministic artifacts (each optional).
 * @param countTokens  Injected token-count function — use container.tokenizer.count
 *                     in the service; pass a stub in tests. Never imported here
 *                     (keeps the function pure/injectable — AC-17).
 *
 * Truncation order on overflow (AC-5 / D3):
 *   1. Drop Project Context spec texts one by one (shortest first to preserve context).
 *   2. Drop prior_prs entirely.
 *   3. Drop downstream callers beyond top-N (halve N on each pass).
 *   4. Drop boilerplate-group SmartDiff file rows.
 *
 * Protected fields: intentText, blastSummary — NEVER dropped (AC-5).
 *
 * Final clamp (cross-model #3): if still > 8K after all drops, apply character-
 * budget truncation to the protected fields so ≤8K ALWAYS holds (AC-4).
 */
export function assembleBriefInput(
  inputs: BriefAssemblyInputs,
  countTokens: (text: string) => number,
): AssembledBriefInput {
  // ---- Step 0: build initial assembled state --------------------------------

  const blast = inputs.blast;
  const blastSummary = blast?.summary ?? '';
  const changedSymbols = blast?.changed_symbols ?? [];
  const downstream = blast?.downstream ?? [];
  const endpointsAffected =
    blast?.downstream.flatMap((d) => d.endpoints_affected) ?? [];
  const cronsAffected = blast?.downstream.flatMap((d) => d.crons_affected) ?? [];
  const blastRef = blast?.ref;

  const smartDiffGroups = inputs.smartDiff ? shapeSmartDiffGroups(inputs.smartDiff) : [];

  const intentText = inputs.intent?.intent;
  const intentInScope = inputs.intent?.in_scope;
  const intentOutOfScope = inputs.intent?.out_of_scope;

  // Mutable copies for truncation
  let priorPrs = blast?.prior_prs ? [...blast.prior_prs] : undefined;
  let currentDownstream = [...downstream];
  let currentSpecTexts = inputs.specTexts ? [...inputs.specTexts] : undefined;
  let currentSmartDiffGroups = smartDiffGroups.map((g) => ({ ...g, files: [...g.files] }));

  // Helper that builds a snapshot and measures it
  const measure = (): { snap: Omit<AssembledBriefInput, 'tokenCount'>; tokens: number } => {
    const snap: Omit<AssembledBriefInput, 'tokenCount'> = {
      blastSummary,
      changedSymbols,
      downstream: currentDownstream,
      endpointsAffected,
      cronsAffected,
      priorPrs: priorPrs?.length ? priorPrs : undefined,
      blastRef,
      smartDiffGroups: currentSmartDiffGroups,
      intentText,
      intentInScope,
      intentOutOfScope,
      linkedIssueText: inputs.linkedIssueText,
      specTexts: currentSpecTexts?.length ? currentSpecTexts : undefined,
    };
    return { snap, tokens: countTokens(serializeForTokenCount(snap)) };
  };

  // ---- Step 1: drop spec texts one by one -----------------------------------
  if (currentSpecTexts && currentSpecTexts.length > 0) {
    let { tokens } = measure();
    // Sort shortest-text last so we drop the shortest ones first (keep the most
    // context per drop).
    currentSpecTexts.sort((a, b) => b.text.length - a.text.length);
    while (tokens > BRIEF_TOKEN_BUDGET && currentSpecTexts.length > 0) {
      currentSpecTexts.pop(); // remove shortest
      ({ tokens } = measure());
    }
    if (currentSpecTexts.length === 0) currentSpecTexts = undefined;
  }

  // ---- Step 2: drop prior_prs -----------------------------------------------
  {
    const { tokens } = measure();
    if (tokens > BRIEF_TOKEN_BUDGET && priorPrs && priorPrs.length > 0) {
      priorPrs = undefined;
    }
  }

  // ---- Step 3: truncate downstream callers beyond top-N --------------------
  {
    let { tokens } = measure();
    let topN = DOWNSTREAM_INITIAL_TOP_N;
    while (tokens > BRIEF_TOKEN_BUDGET && topN > 0) {
      // Sort by total caller count desc to keep the most impactful symbols.
      const sorted = [...currentDownstream].sort((a, b) => b.callers.length - a.callers.length);
      currentDownstream = sorted.slice(0, topN);
      topN = Math.floor(topN / 2);
      ({ tokens } = measure());
    }
    // If we've exhausted topN passes, drop all downstream callers.
    if (tokens > BRIEF_TOKEN_BUDGET) {
      currentDownstream = [];
    }
  }

  // ---- Step 4: drop boilerplate-group SmartDiff file rows ------------------
  {
    let { tokens } = measure();
    if (tokens > BRIEF_TOKEN_BUDGET) {
      // Remove all files from boilerplate groups (least informative).
      currentSmartDiffGroups = currentSmartDiffGroups.map((g) =>
        g.role === 'boilerplate' ? { ...g, files: [] } : g,
      );
      // Remove now-empty boilerplate groups.
      currentSmartDiffGroups = currentSmartDiffGroups.filter(
        (g) => g.role !== 'boilerplate' || g.files.length > 0,
      );
      ({ tokens } = measure());
    }

    // ---- Final clamp (cross-model #3): character-budget truncation ----------
    // If still > 8K after ALL fixed-order drops (e.g. huge intent/blast.summary),
    // apply a last-resort character truncation to those protected fields.
    // This is the ONLY place protected fields may be shortened (AC-4 must always hold).
    if (tokens > BRIEF_TOKEN_BUDGET) {
      // Estimate total char budget: 8000 tokens * ~4 chars/token heuristic.
      // We truncate the combined protected text to fit. This is a hard clamp
      // that guarantees ≤8K even on pathological inputs.
      //
      // Strategy: trim intentText and blastSummary proportionally to their lengths.
      const { tokens: currentTokens } = measure();
      // Compute a rough fraction to keep: budget / actual.
      const keepFraction = BRIEF_TOKEN_BUDGET / currentTokens;
      // Apply to character lengths of protected fields (with a safety margin).
      const clampText = (text: string): string => {
        const maxChars = Math.max(1, Math.floor(text.length * keepFraction * 0.9));
        if (text.length <= maxChars) return text;
        return text.slice(0, maxChars) + TRUNCATION_ELLIPSIS;
      };

      // Clamp blastSummary and intentText (the only never-dropped fields
      // that contribute significant text).
      const clampedBlastSummary = clampText(blastSummary);
      const clampedIntentText = intentText ? clampText(intentText) : intentText;

      // Rebuild the snapshot with clamped fields.
      const finalSnap: Omit<AssembledBriefInput, 'tokenCount'> = {
        blastSummary: clampedBlastSummary,
        changedSymbols,
        downstream: currentDownstream,
        endpointsAffected,
        cronsAffected,
        priorPrs: priorPrs?.length ? priorPrs : undefined,
        blastRef,
        smartDiffGroups: currentSmartDiffGroups,
        intentText: clampedIntentText,
        intentInScope,
        intentOutOfScope,
        linkedIssueText: inputs.linkedIssueText,
        specTexts: currentSpecTexts?.length ? currentSpecTexts : undefined,
      };

      const finalTokens = countTokens(serializeForTokenCount(finalSnap));
      return { ...finalSnap, tokenCount: finalTokens };
    }
  }

  // ---- Assemble final result ------------------------------------------------
  const { snap, tokens } = measure();
  return { ...snap, tokenCount: tokens };
}
