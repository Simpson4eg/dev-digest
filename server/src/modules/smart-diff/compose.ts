import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { classify } from './classify.js';
import { SPLIT_TOO_BIG_LINES } from './constants.js';

/**
 * Pure Smart-Diff composition — the ZERO-LLM step.
 *
 * Takes the PR's changed files and the findings of its latest review (both
 * already in the DB) and produces the risk-ordered `SmartDiff`: files grouped
 * core → wiring → boilerplate, each carrying the lines the reviewer flagged,
 * plus a split suggestion. No provider, no IO — the expensive model pass already
 * happened in the reviewer; this only rearranges its output. Kept a pure
 * function (no DB/`Container`) so it is fully hermetic to test.
 */

/** Minimal shape of a changed file (subset of the `pr_files` row). */
export interface FileInput {
  path: string;
  additions: number;
  deletions: number;
}

/** Minimal shape of a persisted finding (subset of the `findings` row). */
export interface FindingInput {
  file: string;
  start_line: number;
  severity: string;
  title: string;
}

const ROLE_ORDER: SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

const changeSize = (f: { additions: number; deletions: number }) => f.additions + f.deletions;

/**
 * `pseudocode_summary` is populated ONLY from data the last review already
 * persisted (no new LLM call): the highest-severity finding's title on the file.
 * Files with no findings get `null` and the viewer omits the line.
 */
function summarizeFromFindings(findings: FindingInput[]): string | null {
  if (findings.length === 0) return null;
  const top = [...findings].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  )[0]!;
  return top.title;
}

/** Top-level-ish directory (up to two path segments) — the split unit. */
function topDir(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.length <= 1) return '(root)';
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/');
}

/**
 * Split suggestion. `too_big` trips when REVIEWABLE (non-boilerplate) changed
 * lines exceed `SPLIT_TOO_BIG_LINES`; `total_lines` reports that same reviewable
 * count. Proposed splits carve the CORE files by their top-level directory — the
 * most actionable way to break up a mega-PR — and are offered only when the PR
 * is too big AND there is more than one such group.
 */
function buildSplitSuggestion(
  core: SmartDiffFile[],
  reviewableLines: number,
): SmartDiff['split_suggestion'] {
  const tooBig = reviewableLines > SPLIT_TOO_BIG_LINES;
  const proposed: { name: string; files: string[] }[] = [];
  if (tooBig) {
    const byDir = new Map<string, string[]>();
    for (const f of core) {
      const dir = topDir(f.path);
      const arr = byDir.get(dir) ?? [];
      arr.push(f.path);
      byDir.set(dir, arr);
    }
    if (byDir.size > 1) {
      for (const [name, files] of byDir) proposed.push({ name, files });
    }
  }
  return { too_big: tooBig, total_lines: reviewableLines, proposed_splits: proposed };
}

export function composeSmartDiff(files: FileInput[], findings: FindingInput[]): SmartDiff {
  // Index findings by the file they cite.
  const findingsByFile = new Map<string, FindingInput[]>();
  for (const f of findings) {
    const arr = findingsByFile.get(f.file) ?? [];
    arr.push(f);
    findingsByFile.set(f.file, arr);
  }

  // Build a SmartDiffFile per changed file, bucketed by role.
  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  // Only REVIEWABLE (non-boilerplate) churn feeds the split signal — a mega
  // lock-file bump is exactly what Smart Diff wants to keep out of the way, so
  // it must never make a PR look "too big to review".
  let reviewableLines = 0;
  for (const file of files) {
    const fileFindings = findingsByFile.get(file.path) ?? [];
    const findingLines = [...new Set(fileFindings.map((f) => f.start_line))].sort((a, b) => a - b);
    const role = classify(file.path);
    if (role !== 'boilerplate') reviewableLines += changeSize(file);
    const smartFile: SmartDiffFile = {
      path: file.path,
      pseudocode_summary: summarizeFromFindings(fileFindings),
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLines,
    };
    const arr = byRole.get(role) ?? [];
    arr.push(smartFile);
    byRole.set(role, arr);
  }

  // Emit groups in risk order; within a group, flagged files first (most
  // findings first), then by change size desc — the eye lands on risk first.
  const groups: SmartDiffGroup[] = [];
  for (const role of ROLE_ORDER) {
    const filesForRole = byRole.get(role);
    if (!filesForRole || filesForRole.length === 0) continue;
    filesForRole.sort(
      (a, b) =>
        b.finding_lines.length - a.finding_lines.length || changeSize(b) - changeSize(a),
    );
    groups.push({ role, files: filesForRole });
  }

  return {
    groups,
    split_suggestion: buildSplitSuggestion(byRole.get('core') ?? [], reviewableLines),
  };
}
