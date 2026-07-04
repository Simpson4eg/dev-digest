import type { CSSProperties } from "react";

export const s = {
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,

  // ---- Intent Layer panel ----
  intentBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    marginBottom: 24,
  } satisfies CSSProperties,
  intentEmpty: {
    border: "1px dashed var(--border)",
    borderRadius: 8,
    padding: 18,
    marginBottom: 24,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  intentText: {
    margin: "0 0 16px",
    fontSize: 14,
    fontStyle: "italic",
    color: "var(--text-primary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
  } satisfies CSSProperties,
  scopeCol: {} satisfies CSSProperties,
  scopeTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  scopeEmpty: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  scopeUl: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  scopeLi: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
  } satisfies CSSProperties,
} as const;
