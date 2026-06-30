"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ConfidenceNum, MonoLink } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { s } from "./styles";

interface Props {
  candidate: ConventionCandidate;
  onAccept: () => void;
  onReject: () => void;
  pending?: boolean;
  githubBaseUrl?: string | null;
}

export function ConventionCard({ candidate: c, onAccept, onReject, pending, githubBaseUrl }: Props) {
  const t = useTranslations("conventions");
  const [expanded, setExpanded] = React.useState(false);

  const fileHref =
    githubBaseUrl && c.evidence_path
      ? `${githubBaseUrl}/${c.evidence_path}${c.evidence_line != null ? `#L${c.evidence_line}` : ""}`
      : undefined;

  const fileLabel =
    c.evidence_path
      ? `${c.evidence_path}${c.evidence_line != null ? `:${c.evidence_line}` : ""}`
      : null;

  return (
    <div style={s.card(c.status)}>
      <div style={s.cardHeader} onClick={() => setExpanded((e) => !e)}>
        <div style={s.cardHeaderMain}>
          <span style={s.cardRule}>{c.rule}</span>
          <div style={s.cardMeta}>
            {c.category && <span style={s.categoryChip}>{c.category}</span>}
            {fileLabel && (
              <MonoLink href={fileHref}>
                {fileLabel}
              </MonoLink>
            )}
            {c.confidence != null && <ConfidenceNum value={c.confidence} />}
            {c.status !== "candidate" && (
              <span style={s.statusTag(c.status)}>{c.status}</span>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={s.cardBody}>
          {c.evidence_snippet && (
            <pre style={s.snippet}>{c.evidence_snippet}</pre>
          )}
          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              active={c.status === "accepted"}
              disabled={pending}
              onClick={onAccept}
            >
              {t("card.acceptAsSkill")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              active={c.status === "rejected"}
              disabled={pending}
              onClick={onReject}
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
