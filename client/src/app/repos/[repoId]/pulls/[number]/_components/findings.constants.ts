/* findings.constants.ts — feature-level severity constants for the PR-detail
   findings UI. Single source of truth shared by FindingCard, FindingsTab,
   FindingsPanel and the run-trace FindingsSection (previously each kept its own
   copy, which drifted — e.g. SUGGESTION was accent in one place, --sugg in
   others). Keyed by the shared `Severity` contract. */

import type { Severity } from "@devdigest/shared";

/** Canonical severities, in display / sort order (most severe first). */
export const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Severity → CSS colour token. `INFO` is kept defensively: some payloads carry
    it even though the contract enum is CRITICAL/WARNING/SUGGESTION. */
export const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};

/** Colour for a severity not present in {@link SEVERITY_COLOR}. */
export const SEVERITY_COLOR_FALLBACK = "var(--text-muted)";

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};
