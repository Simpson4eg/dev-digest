import type { CSSProperties } from "react";

export const s = {
  reviewInProgress: {
    marginBottom: 18,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  reviewInProgressText: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  reviewInProgressSub: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  lethalTrifecta: {
    marginBottom: 18,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,
  lethalTrifectaTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--crit)",
  } satisfies CSSProperties,
  liveRunSection: {
    marginBottom: 18,
  } satisfies CSSProperties,
  timelineSection: {
    marginBottom: 18,
  } satisfies CSSProperties,
  cancelActions: {
    display: "flex",
    gap: 8,
  } satisfies CSSProperties,
  severityBar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 14,
    flexWrap: "wrap" as const,
  } satisfies CSSProperties,
  severitySep: {
    fontSize: 12,
    color: "var(--text-muted)",
    userSelect: "none" as const,
    padding: "0 2px",
  } satisfies CSSProperties,
  /** A severity filter chip. `color` is the severity token; the active chip gets
      a faint tinted background (`${color}1a`). */
  severityChip: (color: string, isActive: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 9px",
    borderRadius: 14,
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    color,
    background: isActive ? `${color}1a` : "transparent",
    transition: "background 0.15s",
  }),
} as const;
