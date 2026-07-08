/**
 * Ring 2 — pure, summary-first projections and pagination. No I/O, no transport
 * types. Keeps tool responses concise ("stisla structurovana vidpovid"): only
 * the fields the model needs, never a raw dump.
 */
import type {
  AgentSummary,
  BlastRadiusDto,
  Convention,
  Finding,
  ReviewDto,
  Severity,
} from '../api/port.js';

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

export function findingsSummary(findings: Finding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical += 1;
    else if (f.severity === 'WARNING') counts.warning += 1;
    else if (f.severity === 'SUGGESTION') counts.suggestion += 1;
  }
  return counts;
}

/** A trimmed finding for list output — drops long prose (rationale/suggestion). */
export function conciseFinding(f: Finding) {
  return {
    id: f.id,
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    confidence: f.confidence,
  };
}

export function agentSummaries(agents: AgentSummary[], verbose: boolean) {
  return agents.map((a) =>
    verbose
      ? {
          id: a.id,
          name: a.name,
          provider: a.provider,
          model: a.model,
          enabled: a.enabled,
          description: a.description,
          strategy: a.strategy,
          skill_count: a.skill_count ?? 0,
        }
      : { id: a.id, name: a.name, provider: a.provider, model: a.model, enabled: a.enabled },
  );
}

/** The full result of a finished run — the "result, not operation" payload. */
export function conciseReview(review: ReviewDto) {
  return {
    verdict: review.verdict,
    score: review.score,
    summary: review.summary,
    agent: review.agent_name ?? review.agent_id,
    findings_summary: findingsSummary(review.findings),
    findings: review.findings.map(conciseFinding),
  };
}

/** Newest review first (by `created_at`), or undefined when empty. */
export function latestReview(reviews: ReviewDto[]): ReviewDto | undefined {
  return [...reviews].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/**
 * The review produced by a specific run: prefer the exact `run_id` match, else
 * the newest review for that agent (run↔review has no FK — see get_findings).
 */
export function reviewForRun(reviews: ReviewDto[], runId: string, agentId: string): ReviewDto | undefined {
  const byRun = reviews.find((r) => r.run_id === runId);
  if (byRun) return byRun;
  return latestReview(reviews.filter((r) => r.agent_id === agentId));
}

export function conventionsSummary(list: Convention[]) {
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const c of list) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    const cat = c.category ?? 'uncategorized';
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }
  const top = list.slice(0, 10).map((c) => ({ rule: c.rule, category: c.category, status: c.status }));
  return { total: list.length, byStatus, byCategory, top };
}

/**
 * Summary-first projection of a PR's blast radius. Renders each caller as a
 * `file:line` string (concise, and the shape a reviewer jumps to) and rolls up
 * the counts a model needs to reason about impact. Surfaces `degraded`/`reason`
 * so the caller knows the index was absent/partial rather than the PR benign.
 */
export function blastRadiusView(dto: BlastRadiusDto) {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callerCount = 0;
  const downstream = dto.downstream.map((d) => {
    callerCount += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
    return {
      symbol: d.symbol,
      callers: d.callers.map((c) => `${c.file}:${c.line}`),
      endpoints_affected: d.endpoints_affected,
      crons_affected: d.crons_affected,
    };
  });
  return {
    ...(dto.degraded ? { degraded: true, reason: dto.reason } : {}),
    counts: {
      changed_symbols: dto.changed_symbols.length,
      callers: callerCount,
      endpoints: endpoints.size,
      crons: crons.size,
    },
    changed_symbols: dto.changed_symbols,
    downstream,
  };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

export function paginate<T>(items: T[], limit: number, cursor?: string): Page<T> {
  const start = cursor ? Math.max(0, Number(cursor) || 0) : 0;
  const end = start + limit;
  return {
    items: items.slice(start, end),
    nextCursor: end < items.length ? String(end) : null,
    total: items.length,
  };
}

export function matchSeverity(findings: Finding[], severity?: Severity): Finding[] {
  return severity ? findings.filter((f) => f.severity === severity) : findings;
}
