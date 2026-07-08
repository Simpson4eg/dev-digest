import type { BlastRadius, DownstreamImpact, BlastCaller } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

/**
 * Blast Radius — the pure, ZERO-LLM shaping step.
 *
 * The repo-intel facade returns a FLAT caller list tagged with `viaSymbol`
 * (which changed symbol each caller reaches). The wire contract instead groups
 * callers UNDER each changed symbol (`downstream[]`). This function is that
 * regroup + rename — no IO, no model call — so it can be unit-tested with plain
 * arrays (see `shape.test.ts`), mirroring smart-diff's `compose.ts`.
 *
 * Endpoint/cron attribution: on the persistent index path the facade provides
 * `factsByFile`, so each symbol only claims the endpoints/crons of the files its
 * OWN callers live in (precise). On the degraded/ripgrep path there is no
 * `factsByFile`; we fall back to the flat `impactedEndpoints` union so the panel
 * still shows the affected routes, at the cost of per-symbol precision.
 */

/** Max callers surfaced per changed symbol — keeps the panel readable. */
export const MAX_CALLERS_PER_SYMBOL = 20;

export function shapeBlastRadius(result: BlastResult): BlastRadius {
  const changed_symbols = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  // Group the flat callers by the changed symbol they reach.
  const callersByVia = new Map<string, BlastCaller[]>();
  const callerFilesByVia = new Map<string, Set<string>>();
  for (const c of result.callers) {
    let list = callersByVia.get(c.viaSymbol);
    if (!list) {
      list = [];
      callersByVia.set(c.viaSymbol, list);
    }
    list.push({ name: c.symbol, file: c.file, line: c.line });

    let files = callerFilesByVia.get(c.viaSymbol);
    if (!files) {
      files = new Set<string>();
      callerFilesByVia.set(c.viaSymbol, files);
    }
    files.add(c.file);
  }

  // One downstream entry per DISTINCT changed-symbol name that actually has
  // callers (dedup because changed_symbols may repeat a name across files).
  const downstream: DownstreamImpact[] = [];
  const seenName = new Set<string>();
  for (const sym of result.changedSymbols) {
    if (seenName.has(sym.name)) continue;
    seenName.add(sym.name);

    const callers = callersByVia.get(sym.name);
    if (!callers || callers.length === 0) continue;

    const callerFiles = callerFilesByVia.get(sym.name) ?? new Set<string>();
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    if (result.factsByFile) {
      for (const file of callerFiles) {
        const facts = result.factsByFile[file];
        if (!facts) continue;
        for (const e of facts.endpoints) endpoints.add(e);
        for (const cr of facts.crons) crons.add(cr);
      }
    } else {
      // Degraded path: no per-file facts — attribute the flat endpoint union.
      for (const e of result.impactedEndpoints) endpoints.add(e);
    }

    downstream.push({
      symbol: sym.name,
      callers: callers.slice(0, MAX_CALLERS_PER_SYMBOL),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    });
  }

  return {
    changed_symbols,
    downstream,
    summary: '', // Zero LLM calls — the feature is free by tokens.
    degraded: result.degraded,
    reason: result.reason,
  };
}
