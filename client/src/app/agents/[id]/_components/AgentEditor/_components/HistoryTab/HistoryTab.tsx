"use client";

import React from "react";
import { Badge, Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Agent, AgentVersion } from "@devdigest/shared";
import { useAgentVersions } from "@/lib/hooks/agents";
import { s } from "./styles";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function VersionModal({ version, agent, onClose }: { version: AgentVersion; agent: Agent; onClose: () => void }) {
  const cfg = version.config;
  return (
    <Modal
      width={1100}
      title={`v${version.version} — ${dateLabel(version.created_at)}`}
      onClose={onClose}
      footer={
        <div style={s.modalFooter}>
          <Button kind="ghost" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div style={s.metaSection}>
        <div style={s.metaRow}><span style={s.metaKey}>Name</span><span style={s.metaVal}>{cfg.name}</span></div>
        <div style={s.metaRow}><span style={s.metaKey}>Description</span><span style={s.metaVal}>{cfg.description}</span></div>
        <div style={s.metaRow}><span style={s.metaKey}>Provider</span><span style={s.metaVal}>{cfg.provider}</span></div>
        <div style={s.metaRow}><span style={s.metaKey}>Model</span><span style={s.metaVal}>{cfg.model}</span></div>
        <div style={s.metaRow}><span style={s.metaKey}>Strategy</span><span style={s.metaVal}>{cfg.strategy}</span></div>
        <div style={s.metaRow}><span style={s.metaKey}>CI gate</span><span style={s.metaVal}>{cfg.ci_fail_on}</span></div>
        <div style={s.metaRow}><span style={s.metaKey}>Repo intel</span><span style={s.metaVal}>{cfg.repo_intel ? "on" : "off"}</span></div>
        <div style={s.metaRow}><span style={s.metaKey}>Skills</span><span style={s.metaVal}>{cfg.skills.length === 0 ? "none" : `${cfg.skills.length} linked`}</span></div>
      </div>
      <div style={s.compareGrid}>
        <div>
          <div style={s.compareLabel}>System prompt — v{version.version}</div>
          <pre style={s.comparePre}>{cfg.system_prompt}</pre>
        </div>
        <div>
          <div style={s.compareLabel}>System prompt — current v{agent.version}</div>
          <pre style={s.comparePre}>{agent.system_prompt}</pre>
        </div>
      </div>
    </Modal>
  );
}

export function HistoryTab({ agent }: { agent: Agent }) {
  const versions = useAgentVersions(agent.id);
  const [selected, setSelected] = React.useState<AgentVersion | null>(null);

  if (versions.isLoading) return <div style={s.wrap}><Skeleton height={180} /></div>;
  if (versions.isError) return <div style={s.wrap}><ErrorState body="Could not load version history." onRetry={() => versions.refetch()} /></div>;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>Version history</h2>
        <Badge>{versions.data?.length ?? 0} versions</Badge>
      </div>
      <p style={s.hint}>Every config change creates an immutable snapshot. History is never rewritten.</p>
      <div style={s.list}>
        {(versions.data ?? []).map((version) => {
          const current = version.version === agent.version;
          return (
            <div key={version.version} style={s.row(current)}>
              <span style={s.versionNumber}>v{version.version}</span>
              <div style={s.meta}>
                <span style={s.metaMain}>{version.config.name || <em>name not captured</em>}</span>
                <span style={s.metaSub}>{version.config.model} · {version.config.provider} · {dateLabel(version.created_at)}</span>
              </div>
              {current ? (
                <Badge color="var(--ok)" dot>Current</Badge>
              ) : (
                <div style={s.actions}>
                  <Button kind="ghost" size="sm" icon="Eye" onClick={() => setSelected(version)}>View</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selected && <VersionModal version={selected} agent={agent} onClose={() => setSelected(null)} />}
    </div>
  );
}
