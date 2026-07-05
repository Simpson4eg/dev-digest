"use client";

import React from "react";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff } from "@/lib/hooks/reviews";
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
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  // Smart order (risk-ranked, lock-files collapsed) is the default view.
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  const commentCount = comments?.length ?? 0;
  const smartActive = order === "smart" && !!smartDiff;

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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
      {smartActive ? (
        <SmartDiffViewer smartDiff={smartDiff} files={files} />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
