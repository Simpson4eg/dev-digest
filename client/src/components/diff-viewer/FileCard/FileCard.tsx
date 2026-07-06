/* FileCard — one collapsible file in the diff: header (path, +/- stat, finding
   badge, comment count) and, when open, its parsed lines with the finding
   overlay (range highlight, jump anchors, inline note cards) plus any comments. */
"use client";

import React from "react";
import type { CSSProperties } from "react";
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
import { RevealContext, type DiffFinding } from "../reveal";

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

/** Stable DOM id for a given new-file line — the scroll target of a finding jump. */
export function lineAnchorId(path: string, line: number): string {
  return `sd-${path}-L${line}`;
}

const SEV: Record<DiffFinding["severity"], { c: string; label: string }> = {
  CRITICAL: { c: "var(--crit, #f85149)", label: "Critical" },
  WARNING: { c: "var(--warn, #d29922)", label: "Warning" },
  SUGGESTION: { c: "var(--sugg, #539bf5)", label: "Suggestion" },
};

/** Inline note rendered under a finding's start line (option A — collapses with the file). */
function FindingNote({ f }: { f: DiffFinding }) {
  const sev = SEV[f.severity];
  return (
    <div
      style={{
        margin: "4px 12px 8px 58px",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${sev.c}`,
        borderRadius: 6,
        background: "var(--bg-elevated)",
        padding: "8px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: sev.c, letterSpacing: "0.03em" }}>
          {f.severity}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{f.title}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary, var(--text-muted))", whiteSpace: "pre-wrap" }}>
        {f.rationale}
      </div>
      {f.suggestion && (
        <div style={{ fontSize: 12, marginTop: 6, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
          <strong style={{ color: "var(--text-secondary, var(--text-muted))" }}>Suggestion:</strong>{" "}
          {f.suggestion}
        </div>
      )}
    </div>
  );
}

const popoverStyle: CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  zIndex: 30,
  marginTop: 4,
  width: 340,
  maxWidth: "70vw",
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "var(--bg-elevated)",
  boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
  padding: 6,
};

export function FileCard({
  file,
  commenting,
  findings,
  summary,
  onFindingClick,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** The latest review's findings on this file (Smart Diff overlay). */
  findings?: DiffFinding[];
  /** One-line "what the reviewer flagged" summary (Smart Diff), reused from findings. */
  summary?: string | null;
  /** Navigate to the finding in the Findings tab. When provided, badge click calls
   *  this instead of scrolling to the line in the diff. */
  onFindingClick?: (findingId: string) => void;
}) {
  const t = useTranslations("shell");
  const list = React.useMemo(() => findings ?? [], [findings]);
  const findingCount = list.length;
  const [open, setOpen] = React.useState(
    // Flagged files auto-expand so the finding is visible without a click.
    findingCount > 0 || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES,
  );
  const [hoverBadge, setHoverBadge] = React.useState(false);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // The finding-navigator jumped to a line in THIS file → force it open so the
  // line anchor renders (even if the user had collapsed it). The ACTIVE finding
  // is the one whose start line matches the reveal target.
  const reveal = React.useContext(RevealContext);
  const activeFinding =
    reveal && reveal.path === file.path
      ? list.find((f) => f.startLine === reveal.line) ?? null
      : null;
  React.useEffect(() => {
    if (reveal && reveal.path === file.path) setOpen(true);
  }, [reveal, file.path]);

  // Lookups: findings that START on a line (for anchors + inline notes), and
  // range coverage (for the highlight + active tint).
  const startsOn = React.useMemo(() => {
    const m = new Map<number, DiffFinding[]>();
    for (const f of list) {
      const arr = m.get(f.startLine) ?? [];
      arr.push(f);
      m.set(f.startLine, arr);
    }
    return m;
  }, [list]);
  const inAnyRange = React.useCallback(
    (n: number) => list.some((f) => f.startLine <= n && n <= f.endLine),
    [list],
  );

  // Jump to the first (topmost) flagged line, expanding the file if collapsed.
  const scrollToFirstFinding = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen(true);
      if (findingCount === 0) return;
      const first = Math.min(...list.map((f) => f.startLine));
      requestAnimationFrame(() => {
        document
          .getElementById(lineAnchorId(file.path, first))
          ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      });
    },
    [findingCount, list, file.path],
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
          <span
            style={{ position: "relative", display: "inline-flex" }}
            onMouseEnter={() => setHoverBadge(true)}
            onMouseLeave={() => setHoverBadge(false)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onFindingClick && findingCount > 0) {
                  onFindingClick(list[0]!.id);
                } else {
                  scrollToFirstFinding(e);
                }
              }}
              title={onFindingClick ? "Open finding in Findings tab" : "Jump to the first flagged line"}
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
            {hoverBadge && (
              <div style={popoverStyle} onClick={(e) => e.stopPropagation()}>
                {list.map((f) => (
                  <div
                    key={f.id}
                    style={{ display: "flex", gap: 6, padding: "4px 6px", fontSize: 12, alignItems: "baseline" }}
                  >
                    <span
                      style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: SEV[f.severity].c, transform: "translateY(1px)" }}
                    />
                    <span className="mono tnum" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                      L{f.startLine}
                    </span>
                    <span style={{ color: "var(--text-primary)" }}>{f.title}</span>
                  </div>
                ))}
              </div>
            )}
          </span>
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
              const n = ln.newNo;
              const inRange = n != null && inAnyRange(n);
              const active = n != null && !!activeFinding && activeFinding.startLine <= n && n <= activeFinding.endLine;
              const startingHere = n != null ? startsOn.get(n) : undefined;
              return (
                <React.Fragment key={i}>
                  <CodeLine
                    ln={ln}
                    path={file.path}
                    threads={threadsForLine(ln, matched)}
                    commenting={commenting}
                    highlight={inRange}
                    active={active}
                    {...(startingHere ? { anchorId: lineAnchorId(file.path, n!) } : {})}
                  />
                  {startingHere?.map((f) => <FindingNote key={f.id} f={f} />)}
                </React.Fragment>
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
