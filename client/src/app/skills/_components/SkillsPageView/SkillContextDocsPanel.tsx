/* SkillContextDocsPanel — attach/detach repo context docs on a skill (AC-5).
   Reuses the ContextTab design pattern from the Agent editor (Task 7):
   same row shape (grip + checkbox + path + badge + filter + up/down buttons).
   Every agent that uses this skill inherits the attached docs at run time. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillContextDocs, useSetSkillContextDocs } from "@/lib/hooks/skills";
import { useContextDocs } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/providers/repo-context";
import { s } from "./styles";

/** Derive the folder badge from the first path segment (e.g. "specs", "docs"). */
function folderBadge(path: string): string {
  return path.split("/")[0] ?? "";
}

/** Colocated doc-row styles — mirrors ContextTab/styles.ts. */
const dc = {
  wrap: { maxWidth: 900 } satisfies React.CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 8 } satisfies React.CSSProperties,
  h2: { margin: 0, fontSize: 16 } satisfies React.CSSProperties,
  count: { color: "var(--text-muted)", fontSize: 12 } satisfies React.CSSProperties,
  searchWrap: { marginLeft: "auto", position: "relative", width: 240 } as React.CSSProperties,
  searchIcon: { position: "absolute", left: 10, top: 10, color: "var(--text-muted)" } as React.CSSProperties,
  search: { width: "100%", padding: "8px 10px 8px 30px", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg-elevated)", color: "var(--text-primary)", outline: "none" } satisfies React.CSSProperties,
  hint: { color: "var(--text-muted)", fontSize: 12, margin: "0 0 18px" } satisfies React.CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 7 } satisfies React.CSSProperties,
  row: (attached: boolean) => ({ display: "flex", alignItems: "center", gap: 11, minHeight: 46, padding: "8px 11px", border: `1px solid ${attached ? "var(--border-strong)" : "var(--border)"}`, borderRadius: 7, background: attached ? "var(--bg-elevated)" : "var(--bg-surface)" } satisfies React.CSSProperties),
  grip: { color: "var(--text-muted)", cursor: "grab", display: "flex" } satisfies React.CSSProperties,
  text: { flex: 1, minWidth: 0 } satisfies React.CSSProperties,
  path: { fontSize: 13, fontFamily: "monospace", fontWeight: 600 } satisfies React.CSSProperties,
  folder: { color: "var(--text-muted)", fontSize: 12, marginTop: 2 } satisfies React.CSSProperties,
  controls: { display: "flex", gap: 3 } satisfies React.CSSProperties,
  arrow: { border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: 4, display: "flex" } satisfies React.CSSProperties,
};

export function SkillContextDocsPanel({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();

  // Available docs discovered in the repo (Task 3 reader).
  const available = useContextDocs(repoId ?? null);
  // Currently attached paths for this skill (ordered).
  const attached = useSkillContextDocs(skill.id);
  const setDocs = useSetSkillContextDocs();

  const [filter, setFilter] = React.useState("");
  const [dragged, setDragged] = React.useState<string | null>(null);

  // Ordered list of attached paths (the persisted attachment order).
  const [ordered, setOrdered] = React.useState<string[]>([]);

  // Sync local order when the server data changes (skill switch or reload).
  const persistedPaths = (attached.data?.paths ?? []).join("\n");
  React.useEffect(() => {
    setOrdered(attached.data?.paths ?? []);
  }, [skill.id, persistedPaths]);

  // Write the ordered list back to the server.
  const persist = (next: string[]) => {
    setOrdered(next);
    setDocs.mutate({ id: skill.id, paths: next });
  };

  // Move an attached doc up/down by `delta` positions.
  const move = (path: string, delta: number) => {
    const from = ordered.indexOf(path);
    const to = Math.max(0, Math.min(from + delta, ordered.length - 1));
    if (from < 0 || from === to) return;
    const next = [...ordered];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    persist(next);
  };

  // Drop the dragged doc before the target doc.
  const dropBefore = (target: string) => {
    if (!dragged || dragged === target) return;
    const next = ordered.filter((p) => p !== dragged);
    next.splice(next.indexOf(target), 0, dragged);
    setDragged(null);
    persist(next);
  };

  // Loading / error states.
  if (!repoId) {
    return (
      <div style={{ ...s.panel, ...dc.wrap }}>
        <EmptyState icon="FileText" title={t("context.title")} body={t("context.noRepoSelected")} />
      </div>
    );
  }

  if (available.isLoading || attached.isLoading) return <Skeleton height={220} />;

  if (available.isError || attached.isError) {
    return (
      <ErrorState
        body={t("context.loadError")}
        onRetry={() => {
          void available.refetch();
          void attached.refetch();
        }}
      />
    );
  }

  const allPaths = (available.data?.docs ?? []).map((d) => d.path);

  // Attached-first, then unattached discovered docs, then filter.
  // NOTE: ordered paths are always included even when absent from allPaths
  // (stale attachments from a previously-scanned repo state), so attached docs
  // remain visible and detachable regardless of the current discovery result.
  const attachedSet = new Set(ordered);
  const unattached = allPaths.filter((p) => !attachedSet.has(p));
  const visible = [...ordered, ...unattached].filter((p) =>
    p.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div style={{ ...s.panel, ...dc.wrap }}>
      <div style={dc.header}>
        <h2 style={dc.h2}>{t("context.title")}</h2>
        <span style={dc.count}>
          {t("context.attachedCount", { attached: ordered.length, total: allPaths.length })}
        </span>
        <div style={dc.searchWrap}>
          <Icon.Search size={13} style={dc.searchIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("context.filterPlaceholder")}
            style={dc.search}
          />
        </div>
      </div>

      <p style={dc.hint}>{t("context.orderHint")}</p>

      {visible.length === 0 ? (
        <EmptyState
          icon="FileText"
          title={t("context.empty.title")}
          body={t("context.empty.body")}
        />
      ) : (
        <div style={dc.list}>
          {visible.map((path) => {
            const isAttached = attachedSet.has(path);
            const index = ordered.indexOf(path);
            return (
              <div
                key={path}
                draggable={isAttached && !setDocs.isPending}
                onDragStart={() => setDragged(path)}
                onDragOver={(e) => isAttached && e.preventDefault()}
                onDrop={() => isAttached && dropBefore(path)}
                style={dc.row(isAttached)}
              >
                <span style={dc.grip}>
                  <Icon.Menu size={14} />
                </span>
                <input
                  aria-label={`Attach ${path}`}
                  type="checkbox"
                  checked={isAttached}
                  disabled={setDocs.isPending}
                  onChange={(e) =>
                    persist(
                      e.target.checked
                        ? [...ordered, path]
                        : ordered.filter((p) => p !== path),
                    )
                  }
                />
                <div style={dc.text}>
                  <div style={dc.path}>{path}</div>
                </div>
                <Badge>{folderBadge(path)}</Badge>
                {isAttached && (
                  <div style={dc.controls}>
                    <button
                      aria-label={`Move ${path} up`}
                      disabled={setDocs.isPending || index === 0}
                      onClick={() => move(path, -1)}
                      style={dc.arrow}
                    >
                      <Icon.ArrowUp size={14} />
                    </button>
                    <button
                      aria-label={`Move ${path} down`}
                      disabled={setDocs.isPending || index === ordered.length - 1}
                      onClick={() => move(path, 1)}
                      style={dc.arrow}
                    >
                      <Icon.ArrowDown size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
