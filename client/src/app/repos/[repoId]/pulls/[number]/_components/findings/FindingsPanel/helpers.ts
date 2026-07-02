import type { FindingRecord } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";
import { SEVERITY_ORDER } from "../../findings.constants";

/** Optionally drop low-confidence findings, filter by severity, and sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severityFilter?: string | null,
): FindingRecord[] {
  let shown = findings;
  if (severityFilter) shown = shown.filter((f) => f.severity === severityFilter);
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
