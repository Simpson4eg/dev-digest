/* ContextTab — attach/detach/reorder repo context docs on an agent (AC-4, AC-6).
   Modelled on the sibling SkillsTab: same drag-handle + checkbox + name +
   badge + filter-box pattern. Discovers available docs from the active repo
   (GET /repos/:repoId/context-docs) and reads/writes the agent attachment list
   (GET/PUT /agents/:id/context-docs). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentContextDocs, useSetAgentContextDocs } from "@/lib/hooks/agents";
import { useContextDocs } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/providers/repo-context";
import { s } from "./styles";

/** Derive the folder badge from the first path segment (e.g. "specs", "docs"). */
function folderBadge(path: string): string {
  const first = path.split("/")[0] ?? "";
  return first;
}

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();

  // Available docs discovered in the repo (Task 3 reader).
  const available = useContextDocs(repoId ?? null);
  // Currently attached paths for this agent (ordered).
  const attached = useAgentContextDocs(agent.id);
  const setDocs = useSetAgentContextDocs();

  const [filter, setFilter] = React.useState("");
  const [dragged, setDragged] = React.useState<string | null>(null);

  // Ordered list of attached paths (the persisted attachment order).
  const [ordered, setOrdered] = React.useState<string[]>([]);

  // Sync local order when the server data changes (agent switch or reload).
  const persistedPaths = (attached.data?.paths ?? []).join("\n");
  React.useEffect(() => {
    setOrdered(attached.data?.paths ?? []);
  }, [agent.id, persistedPaths]);

  // Write the ordered list back to the server.
  const persist = (next: string[]) => {
    setOrdered(next);
    setDocs.mutate({ id: agent.id, paths: next });
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
      <div style={s.wrap}>
        <EmptyState icon="FileText" title={t("context.noneAttached.title")} body={t("context.noRepoSelected")} />
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

  // Ordered-attached first, then unattached discovered docs, then filter.
  // NOTE: ordered paths are always included even when absent from allPaths
  // (stale attachments from a previously-scanned repo state), so attached docs
  // remain visible and detachable regardless of the current discovery result.
  const attachedSet = new Set(ordered);
  const unattached = allPaths.filter((p) => !attachedSet.has(p));
  const visible = [...ordered, ...unattached].filter((p) =>
    p.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <span style={s.count}>
          {t("context.attachedCount", { attached: ordered.length, total: allPaths.length })}
        </span>
        <div style={s.searchWrap}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("context.filterPlaceholder")}
            style={s.search}
          />
        </div>
      </div>

      <p style={s.hint}>{t("context.orderHint")}</p>

      {visible.length === 0 ? (
        <EmptyState
          icon="FileText"
          title={t("context.empty.title")}
          body={t("context.empty.body")}
        />
      ) : (
        <div style={s.list}>
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
                style={s.row(isAttached)}
              >
                <span style={s.grip}>
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
                <div style={s.text}>
                  <div style={s.path}>{path}</div>
                </div>
                <Badge>{folderBadge(path)}</Badge>
                {isAttached && (
                  <div style={s.controls}>
                    <button
                      aria-label={`Move ${path} up`}
                      disabled={setDocs.isPending || index === 0}
                      onClick={() => move(path, -1)}
                      style={s.arrow}
                    >
                      <Icon.ArrowUp size={14} />
                    </button>
                    <button
                      aria-label={`Move ${path} down`}
                      disabled={setDocs.isPending || index === ordered.length - 1}
                      onClick={() => move(path, 1)}
                      style={s.arrow}
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
