/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Stable DOM id for a given new-file line — the scroll target of a finding badge. */
export function lineAnchorId(path: string, line: number): string {
  return `sd-${path}-L${line}`;
}

export function FileCard({
  file,
  commenting,
  findingLines,
  summary,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** New-file line numbers the latest review flagged (Smart Diff overlay). */
  findingLines?: number[];
  /** One-line "what the reviewer flagged" summary (Smart Diff), reused from findings. */
  summary?: string | null;
}) {
  const t = useTranslations("shell");
  const findingSet = React.useMemo(() => new Set(findingLines ?? []), [findingLines]);
  const findingCount = findingLines?.length ?? 0;
  const [open, setOpen] = React.useState(
    // Flagged files auto-expand so the finding is visible without a click.
    findingCount > 0 || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Jump to the first flagged line (expanding the file first if collapsed).
  const scrollToFirstFinding = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen(true);
      if (findingCount === 0) return;
      const first = Math.min(...(findingLines ?? []));
      requestAnimationFrame(() => {
        document
          .getElementById(lineAnchorId(file.path, first))
          ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      });
    },
    [findingCount, findingLines, file.path]
  );

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {findingCount > 0 && (
          <button
            type="button"
            onClick={scrollToFirstFinding}
            title="Jump to the first flagged line"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--warning-text, #d29922)",
              background: "transparent",
              border: "1px solid var(--warning-text, #d29922)",
              borderRadius: 999,
              padding: "1px 8px",
              cursor: "pointer",
            }}
          >
            <Icon.AlertTriangle size={12} />
            {findingCount} {findingCount === 1 ? "finding" : "findings"}
          </button>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {summary && (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "0 12px 10px 34px",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          <Icon.Sparkles size={12} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>
            <strong style={{ color: "var(--text-secondary, var(--text-muted))" }}>What this does:</strong>{" "}
            {summary}
          </span>
        </div>
      )}
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => {
              const flagged = ln.newNo != null && findingSet.has(ln.newNo);
              return (
                <CodeLine
                  key={i}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  {...(flagged ? { anchorId: lineAnchorId(file.path, ln.newNo!), highlight: true } : {})}
                />
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
