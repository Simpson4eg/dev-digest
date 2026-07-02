import type React from "react";

export const s = {
  layout: {
    display: "flex",
    flexDirection: "column" as const,
    padding: "32px 40px",
    maxWidth: 900,
    margin: "0 auto",
    gap: 24,
  } satisfies React.CSSProperties,

  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  } satisfies React.CSSProperties,

  headingBlock: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  } satisfies React.CSSProperties,

  heading: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "var(--text-primary)",
    margin: 0,
  } satisfies React.CSSProperties,

  subtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies React.CSSProperties,

  meta: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,

  candidateList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  } satisfies React.CSSProperties,

  // ConventionCard
  card: (status: string): React.CSSProperties => ({
    borderRadius: 8,
    border: "1px solid var(--border)",
    borderLeftWidth: 3,
    borderLeftColor:
      status === "accepted"
        ? "var(--ok)"
        : status === "rejected"
          ? "var(--text-muted)"
          : "var(--accent)",
    opacity: status === "rejected" ? 0.55 : 1,
    background: "var(--bg-surface)",
    overflow: "hidden",
  }),

  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 16px",
    cursor: "pointer",
  } satisfies React.CSSProperties,

  cardHeaderMain: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  } satisfies React.CSSProperties,

  cardRule: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-primary)",
    lineHeight: 1.4,
  } satisfies React.CSSProperties,

  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap" as const,
  } satisfies React.CSSProperties,

  cardBody: {
    padding: "0 16px 14px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  } satisfies React.CSSProperties,

  snippet: {
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 5,
    padding: "8px 12px",
    fontFamily: "monospace",
    fontSize: 12,
    color: "var(--text-secondary)",
    overflowX: "auto" as const,
    whiteSpace: "pre" as const,
  } satisfies React.CSSProperties,

  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  } satisfies React.CSSProperties,

  statusTag: (status: string): React.CSSProperties => ({
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color:
      status === "accepted"
        ? "var(--ok)"
        : status === "rejected"
          ? "var(--text-muted)"
          : "var(--accent)",
    textTransform: "uppercase",
  }),

  categoryChip: {
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 7px",
    borderRadius: 4,
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
  } satisfies React.CSSProperties,

  // CreateSkillModal
  modalBody: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
    padding: "4px 0",
  } satisfies React.CSSProperties,

  previewBox: {
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "12px 16px",
    fontFamily: "monospace",
    fontSize: 12,
    whiteSpace: "pre-wrap" as const,
    maxHeight: 200,
    overflowY: "auto" as const,
    color: "var(--text-secondary)",
  } satisfies React.CSSProperties,

  previewLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies React.CSSProperties,
};
