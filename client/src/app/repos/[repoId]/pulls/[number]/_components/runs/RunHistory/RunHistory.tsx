"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore, type IconName } from "@devdigest/ui";
import type { RunSummary, PrCommit } from "@devdigest/shared";
import { formatCost, formatTokenTotal } from "@/lib/cost";
import { s } from "./styles";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace.
 *
 * The badge reflects the review OUTCOME, not just the run lifecycle: a finished
 * run that found blockers reads "rejected" (red), never a green "done". Outcome
 * is derived from the denormalized blocker/finding counts on the run row, so it
 * matches the CI gate (deterministic) rather than the model's verdict.
 */

type Outcome = { key: string; color: string; bg: string; icon: IconName };

function outcomeOf(run: RunSummary): Outcome {
  const status = run.status ?? "";
  if (status === "running")
    return { key: "running", color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" };
  if (status === "failed")
    return { key: "error", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if (status === "cancelled")
    return { key: "cancelled", color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" };
  // Settled ("done"): color by the deterministic outcome.
  if ((run.blockers ?? 0) > 0)
    return { key: "rejected", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if ((run.findings_count ?? 0) > 0)
    return { key: "reviewed", color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" };
  return { key: "approved", color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" };
}

type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

export function RunHistory({
  runs,
  commits = [],
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={s.container}>
      {items.map((item) => {
        if (item.kind === "commit") {
          const c = item.commit;
          return (
            <div key={`commit:${c.sha}`} style={s.commitRow}>
              <Icon.GitCommit size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span className="mono" style={s.sha}>
                {c.sha.slice(0, 7)}
              </span>
              <span style={s.commitMsg} title={c.message}>
                {c.message.split("\n")[0]}
              </span>
              <span style={s.commitMeta}>{c.author}</span>
              {c.committed_at && (
                <span style={s.commitMeta}>
                  {new Date(c.committed_at).toLocaleTimeString()}
                </span>
              )}
            </div>
          );
        }

        const r = item.run;
        const o = outcomeOf(r);
        const settled = r.status === "done";
        return (
          <div key={`run:${r.run_id}`} style={s.row}>
            <Badge color={o.color} bg={o.bg} icon={o.icon}>
              {t(`runStatus.${o.key}`)}
            </Badge>
            {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
            <div style={s.runInfoCol}>
              <div style={s.runNameRow}>
                <button
                  type="button"
                  onClick={() => onGoToReview?.(r.run_id)}
                  title={t("timeline.goToReview")}
                  style={s.agentNameBtn(!!onGoToReview)}
                >
                  {r.agent_name ?? "Agent"}
                </button>{" "}
                <span className="mono" style={s.runModel}>
                  {r.provider}/{r.model}
                </span>
              </div>
              {r.status === "failed" && r.error && (
                <div style={s.runError} title={r.error}>
                  {r.error}
                </div>
              )}
              {settled && (
                <div style={s.runFindings}>
                  {t("runStatus.findings", { count: r.findings_count ?? 0 })}
                  {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
                </div>
              )}
            </div>
            <div style={s.runMeta}>
              {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
              {(() => {
                const tokIn = r.tokens_in ?? 0;
                const tokOut = r.tokens_out ?? 0;
                const tot = tokIn + tokOut;
                if (tot === 0 && r.cost_usd == null) return null;
                return (
                  <span className="mono tnum">
                    {formatTokenTotal(tot > 0 ? tot : null)} · {formatCost(r.cost_usd)}
                  </span>
                );
              })()}
            </div>
            <button
              type="button"
              title={t("timeline.openTrace")}
              aria-label={t("timeline.openTrace")}
              onClick={() => onOpenTrace(r.run_id)}
              style={s.iconBtn}
            >
              <Icon.FileText size={13} />
            </button>
            {onDelete && r.status !== "running" && (
              <span
                role="button"
                aria-label={t("timeline.deleteRun")}
                title={t("timeline.deleteRun")}
                onClick={() => onDelete(r.run_id)}
                style={s.deleteSpan}
              >
                <Icon.Trash size={13} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
