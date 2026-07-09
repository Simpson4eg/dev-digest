/* BlastRadiusPanel — the Blast Radius surface on the PR Overview tab. Answers
   "what can these changes break?": each changed symbol expands into the callers
   that reach it (clickable file:line → GitHub blob at the line) plus the HTTP
   endpoints / cron jobs those callers touch. Data is read straight from the
   repo-intel index server-side (no LLM); a degraded badge shows when the repo
   isn't fully indexed yet instead of a blank panel. */
"use client";

import React from "react";
import { Icon, SectionLabel } from "@devdigest/ui";
import type { DownstreamImpact, BlastDegradedReason } from "@devdigest/shared";
import { MonoLink } from "@/vendor/ui/primitives/MonoLink";
import { githubBlobUrl } from "@/lib/github-urls";
import { useBlastRadius } from "@/lib/hooks/reviews";
import { s } from "./styles";

/** Human copy for the degraded reasons, so the badge is honest and actionable. */
const REASON_TEXT: Record<BlastDegradedReason, string> = {
  flag_off: "Repo intelligence is disabled for this workspace.",
  index_failed: "The repository index failed to build — results are best-effort.",
  index_partial: "The repository index is still building — impact may be incomplete.",
  repo_too_large: "The repository is too large to index fully — impact may be incomplete.",
  no_data: "No index data for these files yet — impact may be incomplete.",
};

function CountChip({ icon, label }: { icon: keyof typeof Icon; label: string }) {
  const I = Icon[icon];
  return (
    <span style={s.blastCount}>
      <I size={13} style={{ flexShrink: 0 }} />
      {label}
    </span>
  );
}

/** One changed symbol + its downstream callers/endpoints/crons, collapsible. */
function SymbolRow({
  impact,
  repoFullName,
  headSha,
  defaultOpen,
}: {
  impact: DownstreamImpact;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const canLink = !!repoFullName && !!headSha;

  return (
    <div>
      <button style={s.blastSymRow} onClick={() => setOpen((o) => !o)}>
        <Icon.ChevronRight
          size={14}
          style={{
            flexShrink: 0,
            transition: "transform 120ms",
            transform: open ? "rotate(90deg)" : "none",
            color: "var(--text-muted)",
          }}
        />
        <span style={s.blastSymName}>{impact.symbol}</span>
        <span style={s.blastSymMeta}>
          {impact.callers.length} caller{impact.callers.length === 1 ? "" : "s"}
        </span>
      </button>

      {open && (
        <>
          <div style={s.blastCallers}>
            {impact.callers.map((c, i) => (
              <MonoLink
                key={`${c.file}:${c.line}:${i}`}
                href={canLink ? githubBlobUrl(repoFullName!, headSha!, c.file, c.line) : undefined}
              >
                {c.file}:{c.line}
              </MonoLink>
            ))}
          </div>
          {(impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0) && (
            <div style={s.blastChips}>
              {impact.endpoints_affected.map((e) => (
                <span key={`e:${e}`} style={s.blastChip}>
                  <Icon.Code size={12} style={{ flexShrink: 0 }} />
                  {e}
                </span>
              ))}
              {impact.crons_affected.map((cr) => (
                <span key={`c:${cr}`} style={s.blastChip}>
                  <Icon.Clock size={12} style={{ flexShrink: 0 }} />
                  {cr}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function BlastRadiusPanel({
  prId,
  repoFullName,
  headSha,
}: {
  prId: string | null | undefined;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
}) {
  const { data: blast, isLoading } = useBlastRadius(prId);

  if (isLoading) return null;

  const callerCount = blast?.downstream.reduce((n, d) => n + d.callers.length, 0) ?? 0;
  const endpointCount = new Set(blast?.downstream.flatMap((d) => d.endpoints_affected) ?? []).size;
  const cronCount = new Set(blast?.downstream.flatMap((d) => d.crons_affected) ?? []).size;
  const hasImpact = (blast?.downstream.length ?? 0) > 0;
  // Caller file:line come from the indexed snapshot — anchor links to that
  // commit (blast.ref), not the PR head, so moved/renamed files don't 404.
  const linkSha = blast?.ref ?? headSha;

  return (
    <section>
      <SectionLabel icon="Zap">Blast Radius</SectionLabel>

      {blast?.degraded && (
        <div style={s.blastBadge}>
          <Icon.AlertTriangle size={13} style={{ flexShrink: 0 }} />
          {blast.reason ? REASON_TEXT[blast.reason] : "Impact may be incomplete."}
        </div>
      )}

      {!hasImpact ? (
        <div style={s.blastEmpty}>
          No downstream impact found for this PR&apos;s changes
          {blast?.degraded ? " yet — the repository index is still catching up." : "."}
        </div>
      ) : (
        <div style={s.blastBox}>
          <div style={s.blastCounts}>
            <CountChip icon="Code" label={`${blast!.changed_symbols.length} changed symbols`} />
            <CountChip icon="Zap" label={`${callerCount} callers`} />
            <CountChip icon="Code" label={`${endpointCount} endpoints`} />
            <CountChip icon="Clock" label={`${cronCount} crons`} />
          </div>
          {blast!.downstream.map((impact, i) => (
            <SymbolRow
              key={impact.symbol}
              impact={impact}
              repoFullName={repoFullName}
              headSha={linkSha}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}
