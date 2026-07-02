"use client";

import React from "react";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { MetricCard } from "@/vendor/ui/charts/MetricCard";
import { s } from "./styles";

const CATEGORY_COLORS = ["var(--crit)", "var(--warn)", "var(--accent)", "var(--ok)", "#8b5cf6", "#06b6d4"];

function percent(value: number | null): string {
  return value == null ? "—" : Math.round(value * 100).toString();
}

export function SkillStatsPanel({ skill }: { skill: Skill }) {
  const stats = useSkillStats(skill.id);
  if (stats.isLoading) return <div style={s.panel}><Skeleton height={260} /></div>;
  if (stats.isError) return <div style={s.panel}><ErrorState body="Could not load skill stats." onRetry={() => stats.refetch()} /></div>;
  if (!stats.data) return null;

  const data = stats.data;
  const segments = data.findings_by_category.map((item, index) => ({
    label: item.category,
    value: item.count,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]!,
  }));
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let cursor = 0;
  const gradient = segments
    .map((segment) => {
      const start = cursor;
      cursor += (segment.value / total) * 100;
      return `${segment.color} ${start}% ${cursor}%`;
    })
    .join(", ");

  return (
    <div style={s.panel}>
      <div style={s.statsGrid}>
        <MetricCard label="USED BY" value={data.used_by_agents.length} suffix=" agents" />
        <MetricCard label={`PULL FREQUENCY (${data.window_days}D)`} value={percent(data.pull_frequency)} suffix={data.pull_frequency == null ? undefined : "%"} />
        <MetricCard label="ACCEPT RATE" value={percent(data.accept_rate)} suffix={data.accept_rate == null ? undefined : "%"} />
        <MetricCard label={`FINDINGS (${data.window_days}D)`} value={data.findings} />
      </div>
      <p style={s.attributionNote}>
        Multi-touch attribution: a run and its findings count for every skill included in that run. Pull frequency is {data.runs_with_skill} of {data.traced_runs} completed runs with skill-aware traces.
      </p>
      <div style={s.statsDetails}>
        <section style={s.statsCard}>
          <div style={s.statsCardTitle}><Icon.Cpu size={14} /> Agents using this skill</div>
          {data.used_by_agents.length === 0 ? (
            <EmptyState icon="Cpu" title="Not attached" body="Attach this skill from an agent's Skills tab." />
          ) : (
            <div style={s.agentRows}>
              {data.used_by_agents.map((agent) => (
                <a key={agent.id} href={`/agents/${agent.id}?tab=skills`} style={s.agentRow}>
                  <span style={s.agentIcon}><Icon.Cpu size={13} /></span>
                  <strong>{agent.name}</strong>
                  <Badge color={agent.enabled ? "var(--ok)" : "var(--text-muted)"}>{agent.enabled ? "enabled" : "disabled"}</Badge>
                  <span style={s.openLabel}>Open</span>
                </a>
              ))}
            </div>
          )}
        </section>
        <section style={s.statsCard}>
          <div style={s.statsCardTitle}><Icon.Tag size={14} /> Findings by category</div>
          {segments.length === 0 ? (
            <EmptyState icon="Tag" title="No findings yet" body="Stats appear after this skill is used in completed review runs." />
          ) : (
            <div style={s.donutWrap}>
              <div style={{ ...s.cssDonut, background: `conic-gradient(${gradient})` }}>
                <div style={s.cssDonutHole}><strong>{total}</strong><span>findings</span></div>
              </div>
              <div style={s.categoryLegend}>
                {segments.map((segment) => (
                  <div key={segment.label} style={s.categoryRow}>
                    <span style={{ ...s.categoryDot, background: segment.color }} />
                    <span>{segment.label}</span>
                    <strong>{segment.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={s.decisionCounts}>
            <span>Accepted <strong>{data.accepted}</strong></span>
            <span>Dismissed <strong>{data.dismissed}</strong></span>
          </div>
        </section>
      </div>
    </div>
  );
}
