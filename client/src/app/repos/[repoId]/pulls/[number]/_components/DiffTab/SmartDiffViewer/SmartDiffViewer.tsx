/* SmartDiffViewer — risk-ordered diff layout for the Files-changed tab.
   Renders the server-composed SmartDiff: files grouped core → wiring →
   boilerplate (boilerplate collapsed by default), each core/wiring file showing
   a clickable "N findings" badge (from the latest review) that jumps to the
   flagged line. Purely presentational — the grouping/overlay is computed
   server-side with no LLM call. */
"use client";

import React from "react";
import type { CSSProperties } from "react";
import { Icon } from "@devdigest/ui";
import { FileCard } from "@/components/diff-viewer/FileCard";
import { RevealContext, type DiffFinding } from "@/components/diff-viewer";
import type { PrFile, SmartDiff } from "@/lib/types";

type Role = SmartDiff["groups"][number]["role"];

const ROLE_META: Record<
  Role,
  { label: string; hint: string; defaultCollapsed: boolean; color: string }
> = {
  core: {
    label: "Core logic",
    hint: "The substance of the change — review closely",
    defaultCollapsed: false,
    color: "var(--accent-text, #539bf5)",
  },
  wiring: {
    label: "Wiring",
    hint: "Hooks the core into the app",
    defaultCollapsed: false,
    color: "var(--warning-text, #d29922)",
  },
  boilerplate: {
    label: "Boilerplate",
    hint: "Generated / mechanical — skim",
    defaultCollapsed: true,
    color: "var(--text-muted)",
  },
};

const st = {
  list: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 2px",
    cursor: "pointer",
    userSelect: "none",
  } satisfies CSSProperties,
  dot: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 } satisfies CSSProperties,
  groupLabel: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  groupHint: { fontSize: 12, color: "var(--text-muted)", flex: 1, minWidth: 0 } satisfies CSSProperties,
  groupCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  groupFiles: { display: "flex", flexDirection: "column", gap: 10, marginTop: 8 } satisfies CSSProperties,
  splitBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--warning-text, #d29922)",
    background: "var(--warn-bg, rgba(210,153,34,0.08))",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;

function Group({
  role,
  files,
  byPath,
  findingsByPath,
  onFindingClick,
}: {
  role: Role;
  files: SmartDiff["groups"][number]["files"];
  byPath: Map<string, PrFile>;
  findingsByPath: Map<string, DiffFinding[]>;
  onFindingClick?: (findingId: string) => void;
}) {
  const meta = ROLE_META[role];
  const [collapsed, setCollapsed] = React.useState(meta.defaultCollapsed);

  // Auto-expand this group when the finding-navigator jumps to a file inside it
  // (so a finding in a collapsed group — e.g. boilerplate — is still reachable).
  const reveal = React.useContext(RevealContext);
  React.useEffect(() => {
    if (reveal && files.some((f) => f.path === reveal.path)) setCollapsed(false);
  }, [reveal, files]);

  return (
    <section>
      <div style={st.groupHeader} onClick={() => setCollapsed((c) => !c)}>
        <Icon.ChevronRight
          size={13}
          style={{ color: "var(--text-muted)", transform: collapsed ? "none" : "rotate(90deg)", transition: "transform .12s" }}
        />
        <span style={{ ...st.dot, background: meta.color }} />
        <span style={st.groupLabel}>{meta.label}</span>
        <span style={st.groupHint}>{meta.hint}</span>
        <span style={st.groupCount}>
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </div>
      {!collapsed && (
        <div style={st.groupFiles}>
          {files.map((f) => {
            const pr = byPath.get(f.path) ?? {
              path: f.path,
              additions: f.additions,
              deletions: f.deletions,
              patch: null,
            };
            return (
              <FileCard
                key={f.path}
                file={pr}
                findings={findingsByPath.get(f.path)}
                summary={f.pseudocode_summary ?? null}
                onFindingClick={onFindingClick}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function SmartDiffViewer({
  smartDiff,
  files,
  findingsByPath,
  onFindingClick,
}: {
  smartDiff: SmartDiff;
  files: PrFile[];
  findingsByPath: Map<string, DiffFinding[]>;
  onFindingClick?: (findingId: string) => void;
}) {
  const byPath = React.useMemo(() => {
    const m = new Map<string, PrFile>();
    for (const f of files) m.set(f.path, f);
    return m;
  }, [files]);

  const split = smartDiff.split_suggestion;

  return (
    <div style={st.list}>
      {split.too_big && (
        <div style={st.splitBanner}>
          <Icon.AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0, color: "var(--warning-text, #d29922)" }} />
          <span>
            This PR changes <strong>{split.total_lines}</strong> lines — large enough to be hard to review.
            {split.proposed_splits.length > 0 && (
              <>
                {" "}
                Consider splitting it into:{" "}
                {split.proposed_splits.map((p) => p.name).join(", ")}.
              </>
            )}
          </span>
        </div>
      )}
      {smartDiff.groups.map((g) => (
        <Group key={g.role} role={g.role} files={g.files} byPath={byPath} findingsByPath={findingsByPath} onFindingClick={onFindingClick} />
      ))}
    </div>
  );
}
