/* IntentPanel — the Intent Layer surface on the PR Overview tab. Renders the
   PR's derived motivation and its IN SCOPE / OUT OF SCOPE lists. Empty state
   ("run a review") until the first review run derives it. Layout-only: all data
   comes from the useIntent hook. */
"use client";

import React from "react";
import { Icon, SectionLabel } from "@devdigest/ui";
import { useIntent } from "@/lib/hooks/reviews";
import { s } from "./styles";

/** One labelled scope column (IN SCOPE / OUT OF SCOPE) with iconed bullets. */
function ScopeList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "in" | "out";
}) {
  const Mark = tone === "in" ? Icon.Check : Icon.X;
  const color = tone === "in" ? "var(--success, #3fb950)" : "var(--text-muted)";
  return (
    <div style={s.scopeCol}>
      <div style={s.scopeTitle}>{title}</div>
      {items.length === 0 ? (
        <div style={s.scopeEmpty}>—</div>
      ) : (
        <ul style={s.scopeUl}>
          {items.map((item, i) => (
            <li key={i} style={s.scopeLi}>
              <Mark size={13} style={{ color, flexShrink: 0, marginTop: 3 }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IntentPanel({ prId }: { prId: string | null | undefined }) {
  const { data: intent, isLoading } = useIntent(prId);

  // Nothing to show while the first load is in flight — avoids a flash of the
  // empty state before the (usually present) intent arrives.
  if (isLoading) return null;

  return (
    <section>
      <SectionLabel icon="Target">Intent</SectionLabel>
      {!intent ? (
        <div style={s.intentEmpty}>
          No intent derived yet — run a review to reconstruct this PR&apos;s
          motivation and scope.
        </div>
      ) : (
        <div style={s.intentBox}>
          <p style={s.intentText}>{intent.intent}</p>
          <div style={s.scopeGrid}>
            <ScopeList title="In scope" items={intent.in_scope} tone="in" />
            <ScopeList title="Out of scope" items={intent.out_of_scope} tone="out" />
          </div>
        </div>
      )}
    </section>
  );
}
