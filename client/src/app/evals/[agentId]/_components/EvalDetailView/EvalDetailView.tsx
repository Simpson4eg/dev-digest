/* EvalDetailView — per-agent Eval Detail page (SPEC-03 AC-15/16/18).
   Route: /evals/[agentId] (dynamic segment → useParams, never params props
   — INSIGHTS 2026-07-10).

   Features:
   - Current recall / precision / citation for this agent, with deltas (a11y:
     text + icon, never color alone).
   - Run history table: one row per run group (newest-first) with version + label
     + metrics + cost.
   - "Compare runs" → the shared CompareModal: pick two runs → per-metric deltas
     + system-prompt diff + Promote (AC-16/18).

   Reuses the dashboard's CompareModal + DeltaLabel + PassFailBadge + helpers so
   the compare contract stays defined in exactly one place (no drift). */
"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { EvalRunGroup } from "@devdigest/shared";
import { useRunHistory, useEvalRunGroups } from "@/lib/hooks/evals";
import { useAgents } from "@/lib/hooks/agents";
import { AppShell } from "@/components/app-shell";
import {
  CompareModal,
  DeltaLabel,
  pct,
  dateLabel,
} from "@/app/evals/_components/EvalDashboardView/EvalDashboardView";
import { s } from "@/app/evals/_components/EvalDashboardView/styles";

export function EvalDetailView() {
  const params = useParams<{ agentId: string }>();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";

  const history = useRunHistory(agentId);
  const runGroupsQuery = useEvalRunGroups(agentId);
  const { data: agentList } = useAgents();

  const [showCompare, setShowCompare] = React.useState(false);

  const agentName =
    (agentList ?? []).find((a) => a.id === agentId)?.name ?? agentId;
  const runGroups: EvalRunGroup[] = runGroupsQuery.data ?? [];
  const canCompare = runGroups.length >= 2;

  const crumb = [
    { label: "Skills Lab" },
    { label: "Eval Dashboard" },
    { label: agentName },
  ];

  if (history.isLoading)
    return (
      <AppShell crumb={crumb}>
        <Skeleton height={300} />
      </AppShell>
    );

  if (history.isError)
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          body="Could not load eval detail."
          onRetry={() => void history.refetch()}
        />
      </AppShell>
    );

  const dash = history.data;
  const current = dash?.current;
  const delta = dash?.delta;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link
          href="/evals"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "var(--text-muted)",
            textDecoration: "none",
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          <Icon.ChevronLeft size={14} aria-hidden="true" />
          Back to Eval Dashboard
        </Link>

        <div style={s.header}>
          <h1 style={s.h1}>{agentName}</h1>
          <div style={s.runAllBtn}>
            <Button
              kind="primary"
              icon="BarChart"
              disabled={!canCompare}
              onClick={() => setShowCompare(true)}
            >
              Compare runs
            </Button>
          </div>
        </div>

        <p style={s.hint}>
          Run history for this agent. Select two runs to compare metric deltas and
          system-prompt changes, then optionally promote a version.
          {!canCompare && " Two or more runs are needed to compare."}
        </p>

        {/* Current metrics (latest run group) */}
        {current && delta && (
          <div style={s.metricRow}>
            {(
              [
                ["Recall", current.recall, delta.recall],
                ["Precision", current.precision, delta.precision],
                ["Citation", current.citation_accuracy, delta.citation_accuracy],
              ] as [string, number, number][]
            ).map(([label, value, d]) => (
              <div key={label} style={s.metric}>
                <div style={s.metricLabel}>{label}</div>
                <div style={s.metricValue}>{pct(value)}</div>
                <DeltaLabel delta={d} />
              </div>
            ))}
          </div>
        )}

        {/* Run history — one row per run group (the units you compare) */}
        <div style={s.runsSection}>
          <div style={s.runsSectionTitle}>
            <span>Run history</span>
          </div>
          {runGroups.length === 0 ? (
            <EmptyState
              icon="FlaskConical"
              title="No runs yet"
              body="Run this agent's eval cases from its Evals tab to see run history here."
            />
          ) : (
            <table style={s.runsTable} aria-label={`Run history for ${agentName}`}>
              <thead>
                <tr>
                  <th style={s.th}>Ran at</th>
                  <th style={s.th}>Version</th>
                  <th style={s.th}>Label</th>
                  <th style={s.th}>Recall</th>
                  <th style={s.th}>Precision</th>
                  <th style={s.th}>Citation</th>
                  <th style={s.th}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {runGroups.map((g) => (
                  <tr key={g.id}>
                    <td style={s.td}>{dateLabel(g.ran_at)}</td>
                    <td style={s.td}>v{g.agent_version}</td>
                    <td style={s.td}>{g.label ?? "—"}</td>
                    <td style={s.td}>{pct(g.recall)}</td>
                    <td style={s.td}>{pct(g.precision)}</td>
                    <td style={s.td}>{pct(g.citation_accuracy)}</td>
                    <td style={s.td}>
                      {g.total_cost_usd !== null ? `$${g.total_cost_usd.toFixed(4)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showCompare && (
          <CompareModal
            agentId={agentId}
            agentName={agentName}
            runGroups={runGroups}
            onClose={() => setShowCompare(false)}
          />
        )}
      </div>
    </AppShell>
  );
}
