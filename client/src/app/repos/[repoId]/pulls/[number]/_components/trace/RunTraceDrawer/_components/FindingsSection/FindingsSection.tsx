/* FindingsSection — the persisted findings of THIS run (same data as the
   "Review runs" list), rendered inside a collapsible TraceSection. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "@/app/repos/[repoId]/pulls/[number]/_components/trace/RunTraceDrawer/styles";
import { SEVERITY_COLOR, SEVERITY_COLOR_FALLBACK } from "@/app/repos/[repoId]/pulls/[number]/_components/findings.constants";
import { TraceSection } from "../TraceSection";

export function FindingsSection({ findings }: { findings: FindingRecord[] }) {
  const t = useTranslations("runs");
  return (
    <TraceSection
      icon="AlertOctagon"
      title={t("trace.findings")}
      right={<Badge color="var(--text-muted)">{findings.length}</Badge>}
    >
      {findings.length === 0 ? (
        <span style={s.noToolCalls}>{t("trace.noFindings")}</span>
      ) : (
        <div style={s.findingsContainer}>
          {findings.map((f) => (
            <div key={f.id} style={s.findingCard}>
              <div style={s.findingCardHeader}>
                <Badge color={SEVERITY_COLOR[f.severity] ?? SEVERITY_COLOR_FALLBACK} bg="transparent">
                  {f.severity}
                </Badge>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{f.title}</span>
              </div>
              <div className="mono" style={s.findingCardFile}>
                {f.file}:{f.start_line}
                {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
              </div>
              <div style={s.findingCardText}>{f.rationale}</div>
              {f.suggestion && (
                <div style={s.findingCardSuggestion}>
                  <strong>{t("trace.suggestedFix")} </strong>
                  {f.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </TraceSection>
  );
}
