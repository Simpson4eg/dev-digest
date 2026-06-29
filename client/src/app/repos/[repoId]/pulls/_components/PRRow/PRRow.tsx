/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { formatCost } from "@/lib/cost";
import { SIZE_COLOR, STATUS_META } from "@/app/repos/[repoId]/pulls/constants";
import { relativeTime, sizeOf } from "@/app/repos/[repoId]/pulls/helpers";
import { s } from "@/app/repos/[repoId]/pulls/styles";

type FindingsSummary = NonNullable<PrMeta["findings_summary"]>;

const SEV_COLOR = {
  critical: "var(--crit)",
  warning: "var(--warn)",
  suggestion: "var(--sugg)",
} as const;

function FindingsChips({ summary }: { summary: FindingsSummary }) {
  const parts: { label: string; color: string }[] = [];
  if (summary.critical > 0) parts.push({ label: `${summary.critical} CRITICAL`, color: SEV_COLOR.critical });
  if (summary.warning > 0) parts.push({ label: `${summary.warning} WARNING`, color: SEV_COLOR.warning });
  if (summary.suggestion > 0) parts.push({ label: `${summary.suggestion} SUGGESTION`, color: SEV_COLOR.suggestion });
  if (parts.length === 0) return <span style={s.muted}>—</span>;
  return (
    <span style={s.findingsChips}>
      {parts.map((p, i) => (
        <React.Fragment key={p.color}>
          {i > 0 && <span style={s.findingChipSep}>·</span>}
          <span style={s.findingChipLabel(p.color)}>{p.label}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null;
  const hasFindings =
    pr.findings_summary != null &&
    (pr.findings_summary.critical + pr.findings_summary.warning + pr.findings_summary.suggestion) > 0;
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        {hasFindings ? (
          <FindingsChips summary={pr.findings_summary!} />
        ) : reviewed ? (
          <span style={s.muted}>—</span>
        ) : null}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={pr.cost_usd == null ? { ...s.costCell, ...s.muted } : s.costCell}>
        {formatCost(pr.cost_usd)}
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
