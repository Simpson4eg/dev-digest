import type React from "react";

export const s = {
  wrap: { maxWidth: 900 } satisfies React.CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 8 } satisfies React.CSSProperties,
  h2: { margin: 0, fontSize: 16 } satisfies React.CSSProperties,
  count: { color: "var(--text-muted)", fontSize: 12 } satisfies React.CSSProperties,
  searchWrap: { marginLeft: "auto", position: "relative", width: 240 } satisfies React.CSSProperties,
  searchIcon: { position: "absolute", left: 10, top: 10, color: "var(--text-muted)" } satisfies React.CSSProperties,
  search: { width: "100%", padding: "8px 10px 8px 30px", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg-elevated)", color: "var(--text-primary)", outline: "none" } satisfies React.CSSProperties,
  hint: { color: "var(--text-muted)", fontSize: 12, margin: "0 0 18px" } satisfies React.CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 7 } satisfies React.CSSProperties,
  row: (attached: boolean, enabled: boolean) => ({ display: "flex", alignItems: "center", gap: 11, minHeight: 46, padding: "8px 11px", border: `1px solid ${attached ? "var(--border-strong)" : "var(--border)"}`, borderRadius: 7, background: attached ? "var(--bg-elevated)" : "var(--bg-surface)", opacity: enabled ? 1 : 0.55 } satisfies React.CSSProperties),
  grip: { color: "var(--text-muted)", cursor: "grab", display: "flex" } satisfies React.CSSProperties,
  text: { flex: 1, minWidth: 0 } satisfies React.CSSProperties,
  name: { fontSize: 13, fontWeight: 650 } satisfies React.CSSProperties,
  description: { color: "var(--text-muted)", fontSize: 12, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } satisfies React.CSSProperties,
  controls: { display: "flex", gap: 3 } satisfies React.CSSProperties,
  arrow: { border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: 4, display: "flex" } satisfies React.CSSProperties,
};
