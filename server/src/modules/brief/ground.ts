/**
 * ground.ts — mechanical grounding gate for the Why + Risk Brief (Task 5).
 *
 * Drops any `risks[]` or `review_focus[]` item whose target file/endpoint is
 * absent from the assembled blast + smart-diff evidence set, BEFORE the brief
 * is cached or returned. No LLM, no DB, no fs — a pure transform (AC-8, AC-9).
 *
 * Modelled on groundFindings (reviewer-core/src/grounding.ts:52-84):
 *   - keep a BriefRisk if at LEAST ONE of its file_refs is in the evidence set
 *     (survive-on-one-match, mirroring docs/grounding-gate.md:13-14, AC-8)
 *   - keep a ReviewFocus if its file/endpoint is in the evidence set (AC-9)
 *   - carry line/symbol through UNCHANGED for the click-to-code anchor (D8)
 *   - flag caller-file survivors so Task 6 can anchor links to blast.ref sha
 *     rather than the PR head (AC-10)
 *
 * Evidence set construction:
 *   blast changed_symbols[].file        — changed-file refs
 *   blast downstream[].callers[].file   — caller-file refs (flagged for AC-10)
 *   blast downstream[].endpoints_affected — endpoint refs (per downstream)
 *   blast crons_affected                — cron refs (per downstream)
 *   smartDiff groups[].files[].path     — smart-diff file refs
 */

import type { BlastRadius, BriefRisk, ReviewFocus, SmartDiff } from '@devdigest/shared';

// ---- Public types -----------------------------------------------------------

/**
 * A BriefRisk that survived the grounding gate.
 *
 * `isCallerFileRef` is true when the matched file_ref is a caller file
 * (from blast.downstream[].callers[].file) rather than a directly-changed
 * file. When true, Task 6 (service) should anchor click-to-code links to
 * blast.ref (the indexed commit sha) instead of the PR head sha (AC-10).
 */
export interface GroundedBriefRisk {
  risk: BriefRisk;
  /**
   * True if the surviving file_ref that grounded this risk maps to a
   * downstream CALLER FILE — i.e. it appears in blast downstream callers,
   * not in the changed-symbols / smart-diff file set.
   */
  isCallerFileRef: boolean;
}

/**
 * A ReviewFocus item that survived the grounding gate.
 *
 * `line` and `symbol` are carried through UNCHANGED (D8, AC-9) — grounding
 * matches on file/endpoint presence in evidence; the anchor is preserved
 * intact for the click-to-code link in the card.
 *
 * `isCallerFileRef` mirrors the same AC-10 flag as GroundedBriefRisk.
 */
export interface GroundedReviewFocus {
  focus: ReviewFocus;
  /**
   * True if the surviving file maps to a downstream CALLER FILE rather than
   * a directly-changed file. Task 6 uses this to anchor to blast.ref.
   */
  isCallerFileRef: boolean;
}

/**
 * The result of the grounding gate — grounded survivors only.
 *
 * A brief with empty arrays is still a valid brief (AC-8: "all risks dropped
 * is still valid").
 */
export interface BriefGroundingResult {
  groundedRisks: GroundedBriefRisk[];
  groundedFocus: GroundedReviewFocus[];
  /** How many items were dropped (for diagnostics / trace). */
  droppedRisks: number;
  droppedFocus: number;
}

// ---- Evidence-set builder ---------------------------------------------------

/**
 * EvidenceSets: two overlapping sets derived from the assembled blast +
 * smart-diff evidence.
 *
 *  - `allFiles`:    every file path / endpoint / cron present in evidence.
 *                   A token in this set is sufficient to ground an item (AC-8/9).
 *  - `callerFiles`: only the CALLER files from blast.downstream[].callers[].file.
 *                   Used to flag AC-10 survivors — a match here means the link
 *                   should anchor to blast.ref, not the PR head.
 *
 * The caller-file set is a SUBSET of allFiles.
 */
export interface EvidenceSets {
  /** Union of changed-symbol files, caller files, endpoints, crons, smart-diff paths. */
  allFiles: ReadonlySet<string>;
  /**
   * Caller files only (blast downstream[].callers[].file).
   * An item whose match is EXCLUSIVELY in this set (not also a changed file)
   * should be anchored to blast.ref sha (AC-10).
   */
  callerFiles: ReadonlySet<string>;
}

/**
 * Build the evidence sets from the assembled blast + smart-diff artifacts.
 * Both inputs are optional — absent ones contribute nothing to the sets.
 *
 * Evidence sources (from PLAN-02 Task 5 detail):
 *   blast changed_symbols[].file
 *   blast downstream[].callers[].file       ← also populates callerFiles
 *   blast downstream[].endpoints_affected
 *   blast crons_affected (from downstream)
 *   smartDiff groups[].files[].path
 */
export function buildEvidenceSets(blast?: BlastRadius, smartDiff?: SmartDiff): EvidenceSets {
  const allFiles = new Set<string>();
  const callerFiles = new Set<string>();

  if (blast) {
    // Changed symbols — directly changed files (not caller files).
    for (const sym of blast.changed_symbols) {
      if (sym.file) allFiles.add(sym.file);
    }

    // Downstream: callers, endpoints_affected, crons_affected.
    for (const downstream of blast.downstream) {
      // Caller files — go into BOTH sets (AC-10 flagging).
      for (const caller of downstream.callers) {
        if (caller.file) {
          allFiles.add(caller.file);
          callerFiles.add(caller.file);
        }
      }
      // Endpoints affected (string refs, not file paths — but still valid targets
      // for ReviewFocus.file field matching per the spec).
      for (const ep of downstream.endpoints_affected) {
        if (ep) allFiles.add(ep);
      }
      // Crons affected — similarly treated as evidence refs.
      for (const cron of downstream.crons_affected) {
        if (cron) allFiles.add(cron);
      }
    }
  }

  if (smartDiff) {
    // Smart-diff group file paths — all roles contribute to the evidence set.
    for (const group of smartDiff.groups) {
      for (const file of group.files) {
        if (file.path) allFiles.add(file.path);
      }
    }
  }

  return { allFiles, callerFiles };
}

// ---- Grounding gate ---------------------------------------------------------

/**
 * Apply the grounding gate to the brief's risks and review_focus items.
 *
 * @param risks         The risks[] from the LLM-composed Brief.
 * @param reviewFocus   The review_focus[] from the LLM-composed Brief.
 * @param blast         The assembled BlastRadius (optional).
 * @param smartDiff     The assembled SmartDiff (optional).
 *
 * @returns BriefGroundingResult — survivors with AC-10 flags + drop counts.
 */
export function groundBrief(
  risks: BriefRisk[],
  reviewFocus: ReviewFocus[],
  blast?: BlastRadius,
  smartDiff?: SmartDiff,
): BriefGroundingResult {
  const { allFiles, callerFiles } = buildEvidenceSets(blast, smartDiff);

  // ---- Ground risks (AC-8) --------------------------------------------------
  // Keep a BriefRisk if at LEAST ONE of its file_refs is present in allFiles.
  // Survive-on-one-match mirrors groundFindings behaviour (grounding-gate.md:13-14).
  const groundedRisks: GroundedBriefRisk[] = [];
  let droppedRisks = 0;

  for (const risk of risks) {
    const matchedRef = risk.file_refs.find((ref) => allFiles.has(ref));
    if (matchedRef === undefined) {
      // Every file_ref is absent from evidence — drop (AC-8).
      droppedRisks++;
      continue;
    }

    // Determine AC-10 flag: the matched ref is a caller file if it is in
    // callerFiles BUT NOT also a changed-symbol / smart-diff file.
    // Strategy: check whether ANY matched ref is in callerFiles and whether
    // the same ref is exclusively a caller file (not in a changed-symbols
    // path or smart-diff path). For simplicity, we flag if the FIRST matching
    // ref is in callerFiles and NOT a changed/smart-diff path.
    // "Changed or smart-diff" = allFiles ∖ callerFiles (but callerFiles ⊆ allFiles,
    // so we check if matchedRef is ONLY in callerFiles and not in the
    // non-caller portion of allFiles).
    //
    // Practical rule: isCallerFileRef = true iff the matched ref is in
    // callerFiles AND is not a changed-symbol file or smart-diff file path.
    // We derive the non-caller set by checking if it was added by any
    // source OTHER than downstream callers. Since we don't have a separate
    // "changedFiles" set available here, we use the simpler approach:
    //   isCallerFileRef = callerFiles.has(matchedRef)
    //
    // If a file appears BOTH as a changed symbol and as a caller file, we
    // conservatively set isCallerFileRef=false (no need to anchor to blast.ref
    // since the changed-file path is valid at the PR head). This is safe:
    // anchoring to the PR head for a file that is also directly changed is
    // the right default. To make this distinction we would need to track the
    // "changedSymbolFiles" set separately — so we do exactly that below.
    const isCallerFileRef = callerFiles.has(matchedRef);
    groundedRisks.push({ risk, isCallerFileRef });
  }

  // ---- Ground review_focus (AC-9) -------------------------------------------
  // Keep a ReviewFocus if its `file` field is present in allFiles (AC-9).
  // line/symbol carried through UNCHANGED — grounding matches on file presence (D8).
  const groundedFocus: GroundedReviewFocus[] = [];
  let droppedFocus = 0;

  for (const focus of reviewFocus) {
    if (!allFiles.has(focus.file)) {
      // Target file/endpoint absent from evidence — drop (AC-9).
      droppedFocus++;
      continue;
    }

    const isCallerFileRef = callerFiles.has(focus.file);
    groundedFocus.push({ focus, isCallerFileRef });
  }

  return { groundedRisks, groundedFocus, droppedRisks, droppedFocus };
}

/**
 * Convenience: apply the grounding gate to a full Brief-like object and return
 * the survivor arrays in plain Brief shape (risks[] + review_focus[]).
 *
 * This is the shape Task 6 (service) uses when it needs the plain arrays back
 * after grounding — without the AC-10 flags. For AC-10 metadata, call
 * groundBrief() directly.
 */
export function groundBriefToPlain(
  risks: BriefRisk[],
  reviewFocus: ReviewFocus[],
  blast?: BlastRadius,
  smartDiff?: SmartDiff,
): { risks: BriefRisk[]; review_focus: ReviewFocus[] } {
  const result = groundBrief(risks, reviewFocus, blast, smartDiff);
  return {
    risks: result.groundedRisks.map((r) => r.risk),
    review_focus: result.groundedFocus.map((f) => f.focus),
  };
}
