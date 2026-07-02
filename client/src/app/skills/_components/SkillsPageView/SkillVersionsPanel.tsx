"use client";

import React from "react";
import { Badge, Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/providers/toast";
import { s } from "./styles";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function SkillVersionsPanel({ skill }: { skill: Skill }) {
  const versions = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const toast = useToast();
  const [compare, setCompare] = React.useState<SkillVersion | null>(null);

  const restore = async (version: SkillVersion) => {
    if (!window.confirm(`Restore the body from v${version.version}? This will create a new version.`)) return;
    const saved = await update.mutateAsync({ id: skill.id, patch: { body: version.body } });
    toast.success(`Restored v${version.version} as new v${saved.version}`);
  };

  if (versions.isLoading) return <div style={s.panel}><Skeleton height={180} /></div>;
  if (versions.isError) return <div style={s.panel}><ErrorState body="Could not load version history." onRetry={() => versions.refetch()} /></div>;

  return (
    <div style={s.panel}>
      <div style={s.sectionTitleRow}>
        <h2 style={s.sectionTitle}>Version history</h2>
        <Badge>{versions.data?.length ?? 0} versions</Badge>
      </div>
      <p style={s.sectionHint}>Every body change creates an immutable snapshot. Restoring an older body creates a new version; history is never rewritten.</p>
      <div style={s.versionList}>
        {(versions.data ?? []).map((version) => {
          const current = version.version === skill.version;
          return (
            <div key={version.version} style={s.versionRow(current)}>
              <span style={s.versionNumber}>v{version.version}</span>
              <div style={s.versionText}>
                <strong>{current ? "Current body" : "Body snapshot"}</strong>
                <span>{dateLabel(version.created_at)}</span>
              </div>
              {current ? <Badge color="var(--ok)" dot>Current</Badge> : (
                <div style={s.versionActions}>
                  <Button kind="ghost" size="sm" icon="Eye" onClick={() => setCompare(version)}>Diff</Button>
                  <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => void restore(version)} disabled={update.isPending}>Restore</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {compare && (
        <Modal
          width={1100}
          title={`Compare v${compare.version} with current v${skill.version}`}
          onClose={() => setCompare(null)}
          footer={<div style={s.actions}><Button kind="ghost" onClick={() => setCompare(null)}>Close</Button><Button kind="primary" icon="RefreshCw" onClick={() => void restore(compare)}>Restore v{compare.version}</Button></div>}
        >
          <div style={s.compareGrid}>
            <div><div style={s.compareLabel}>v{compare.version}</div><pre style={s.comparePre}>{compare.body}</pre></div>
            <div><div style={s.compareLabel}>Current v{skill.version}</div><pre style={s.comparePre}>{skill.body}</pre></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
