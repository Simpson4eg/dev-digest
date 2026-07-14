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

  error: {
    color: "var(--error)",
    fontSize: 13,
    margin: 0,
  } satisfies React.CSSProperties,

  list: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  } satisfies React.CSSProperties,

  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies React.CSSProperties,

  rowIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies React.CSSProperties,

  rowPath: {
    fontSize: 13,
    fontFamily: "monospace",
    color: "var(--text-primary)",
    wordBreak: "break-all" as const,
  } satisfies React.CSSProperties,
};
