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
  onEdit: (patch: { rule?: string; category?: string }) => void;
  pending?: boolean;
  githubBaseUrl?: string | null;
}

export function ConventionCard({ candidate: c, onAccept, onReject, onEdit, pending, githubBaseUrl }: Props) {
  const t = useTranslations("conventions");
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draftRule, setDraftRule] = React.useState(c.rule);
  const [draftCategory, setDraftCategory] = React.useState(c.category ?? "");

  const fileHref =
    githubBaseUrl && c.evidence_path
      ? `${githubBaseUrl}/${c.evidence_path}${c.evidence_line != null ? `#L${c.evidence_line}` : ""}`
      : undefined;

  const fileLabel =
    c.evidence_path
      ? `${c.evidence_path}${c.evidence_line != null ? `:${c.evidence_line}` : ""}`
      : null;

  function handleSave() {
    onEdit({ rule: draftRule || undefined, category: draftCategory || undefined });
    setEditing(false);
  }

  function handleCancel() {
    setDraftRule(c.rule);
    setDraftCategory(c.category ?? "");
    setEditing(false);
  }

  return (
    <div style={s.card(c.status)}>
      <div style={s.cardHeader} onClick={() => !editing && setExpanded((e) => !e)}>
        <div style={s.cardHeaderMain}>
          {editing ? (
            <input
              autoFocus
              value={draftRule}
              onChange={(e) => setDraftRule(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
                background: "var(--bg-primary)",
                border: "1px solid var(--accent)",
                borderRadius: 4,
                padding: "2px 6px",
                width: "100%",
                outline: "none",
              }}
            />
          ) : (
            <span style={s.cardRule}>{c.rule}</span>
          )}
          <div style={s.cardMeta}>
            {editing ? (
              <input
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="category"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: "var(--bg-primary)",
                  border: "1px solid var(--accent)",
                  color: "var(--text-secondary)",
                  width: 120,
                  outline: "none",
                }}
              />
            ) : (
              c.category && <span style={s.categoryChip}>{c.category}</span>
            )}
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
            {editing ? (
              <>
                <Button
                  kind="primary"
                  size="sm"
                  icon="Check"
                  disabled={pending || !draftRule.trim()}
                  onClick={handleSave}
                >
                  Save
                </Button>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="X"
                  disabled={pending}
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
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
                <Button
                  kind="ghost"
                  size="sm"
                  icon="Edit"
                  disabled={pending}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
