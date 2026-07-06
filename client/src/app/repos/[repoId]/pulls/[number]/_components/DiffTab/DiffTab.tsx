"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SectionLabel, Button } from "@devdigest/ui";
import {
  DiffViewer,
  RevealContext,
  lineAnchorId,
  type DiffCommentApi,
  type RevealTarget,
  type DiffFinding,
} from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff, usePrReviews } from "@/lib/hooks/reviews";
import { qk } from "@/lib/query-keys";
import { notify } from "@/lib/providers/toast";
import type { PrFile } from "@devdigest/shared";
import { SmartDiffViewer } from "./SmartDiffViewer";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

type DiffOrder = "smart" | "original";

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const { data: comments } = usePrComments(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  // Smart order (risk-ranked, lock-files collapsed) is the default view.
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  const commentCount = comments?.length ?? 0;
  const smartActive = order === "smart" && !!smartDiff;

  // Smart Diff reads `pr_files`, which the pull-detail endpoint refreshes as a
  // side-effect; the two requests race, so a freshly re-imported file (e.g. a
  // lock-file) can be missing from the first smart-diff read while Original
  // order (fresh pull detail) shows it. Refetch smart-diff once the PR's file
  // set is known/changes, so both orders stay consistent.
  const qc = useQueryClient();
  React.useEffect(() => {
    if (prId) qc.invalidateQueries({ queryKey: qk.smartDiff(prId) });
  }, [qc, prId, filesCount]);

  // ---- Finding overlay + navigator -----------------------------------------
  // Full findings of the LATEST review, keyed by file — drives the badge, range
  // highlight, jump anchors, hover list and inline notes in BOTH orders. (Same
  // "latest review" the smart-diff grouping uses server-side.)
  const findingsByPath = React.useMemo(() => {
    const m = new Map<string, DiffFinding[]>();
    const latest = reviews?.find((r) => r.kind === "review") ?? reviews?.[0];
    for (const f of latest?.findings ?? []) {
      const arr = m.get(f.file) ?? [];
      arr.push({
        id: f.id,
        severity: f.severity,
        title: f.title,
        rationale: f.rationale,
        suggestion: f.suggestion ?? null,
        startLine: f.start_line,
        endLine: f.end_line,
      });
      m.set(f.file, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.startLine - b.startLine);
    return m;
  }, [reviews]);

  // Flat, ordered finding list (jump targets = finding start lines) — follows
  // the CURRENT view order so j/k feel natural (Smart = group/file order;
  // Original = file order).
  const findingList = React.useMemo(() => {
    const out: { path: string; line: number }[] = [];
    const paths =
      order === "smart" && smartDiff
        ? smartDiff.groups.flatMap((g) => g.files.map((f) => f.path))
        : files.map((f) => f.path);
    for (const p of paths) {
      const fs = findingsByPath.get(p);
      if (fs) for (const f of fs) out.push({ path: p, line: f.startLine });
    }
    return out;
  }, [order, smartDiff, files, findingsByPath]);

  const total = findingList.length;
  const [cursor, setCursor] = React.useState(-1);
  const [reveal, setReveal] = React.useState<RevealTarget | null>(null);
  const nonce = React.useRef(0);

  // Reset position when the list identity changes (order switch / new data).
  React.useEffect(() => {
    setCursor(-1);
  }, [order, total]);

  const jump = React.useCallback(
    (dir: 1 | -1) => {
      if (total === 0) return;
      const next = cursor < 0 ? (dir === 1 ? 0 : total - 1) : (cursor + dir + total) % total;
      setCursor(next);
      const t = findingList[next]!;
      nonce.current += 1;
      setReveal({ path: t.path, line: t.line, nonce: nonce.current });
    },
    [cursor, findingList, total],
  );

  // Scroll to the revealed finding. The target file/group open themselves via
  // RevealContext, so the anchor may not exist yet on the first frame — retry a
  // few frames until it renders, then flash a brief outline.
  React.useEffect(() => {
    if (!reveal) return;
    const id = lineAnchorId(reveal.path, reveal.line);
    let tries = 0;
    let raf = 0;
    const attempt = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView?.({ behavior: "smooth", block: "center" });
        const prevOutline = el.style.outline;
        el.style.outline = "2px solid var(--warning-text, #d29922)";
        el.style.outlineOffset = "-2px";
        window.setTimeout(() => {
          el.style.outline = prevOutline;
          el.style.outlineOffset = "";
        }, 2000);
      } else if (tries++ < 12) {
        raf = requestAnimationFrame(attempt);
      }
    };
    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
  }, [reveal]);

  // Hotkeys: j = next finding, k = previous (matches the Findings tab's j/k).
  // Ignored while typing in an input/textarea or with a modifier held.
  React.useEffect(() => {
    if (total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
      if (e.key === "j") {
        e.preventDefault();
        jump(1);
      } else if (e.key === "k") {
        e.preventDefault();
        jump(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, total]);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {total > 0 && (
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
                title="Jump between findings (j / k)"
              >
                <Button
                  kind="ghost"
                  size="sm"
                  icon="ArrowUp"
                  aria-label="Previous finding (k)"
                  onClick={() => jump(-1)}
                />
                <span
                  className="tnum"
                  style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 62, textAlign: "center" }}
                >
                  {cursor < 0 ? "–" : cursor + 1} / {total} findings
                </span>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="ArrowDown"
                  aria-label="Next finding (j)"
                  onClick={() => jump(1)}
                />
              </span>
            )}
            {smartDiff && (
              <span style={{ display: "inline-flex", gap: 2 }}>
                <Button
                  kind={order === "smart" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setOrder("smart")}
                >
                  Smart order
                </Button>
                <Button
                  kind={order === "original" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setOrder("original")}
                >
                  Original order
                </Button>
              </span>
            )}
            {!smartActive && commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </span>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      <RevealContext.Provider value={reveal}>
        {smartActive ? (
          <SmartDiffViewer smartDiff={smartDiff} files={files} findingsByPath={findingsByPath} />
        ) : (
          <DiffViewer files={files} commenting={commenting} findingsByPath={findingsByPath} />
        )}
      </RevealContext.Provider>
    </section>
  );
}
