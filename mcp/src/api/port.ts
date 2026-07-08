/**
 * Ring 1 — the domain contract the MCP tools depend on.
 *
 * These types mirror the subset of `@devdigest/shared` API response shapes that
 * the tools actually use. They are declared locally (not imported cross-package)
 * on purpose: a thin external client should stay self-contained — it must
 * typecheck and test without wiring the server's source tree into its build, and
 * it should not break every time an unrelated server-internal type shifts.
 *
 * The dependency rule: tools (Ring 4) and the application layer (Ring 2) depend
 * on `DevDigestApi`, never on the concrete HTTP client (Ring 3). The client is
 * wired once in the composition root (server.ts) and injected inward.
 */

export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
export type ConventionStatus = 'candidate' | 'accepted' | 'rejected';

/** One review agent, as returned by `GET /agents`. */
export interface AgentSummary {
  id: string;
  name: string;
  description: string;
  provider: string;
  model: string;
  enabled: boolean;
  strategy: string;
  skill_count?: number;
}

/** A repository reference, from `GET /repos`. */
export interface RepoRef {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}

/** A pull-request reference, from `GET /repos/:id/pulls`. */
export interface PrRef {
  id: string;
  number: number;
  title: string;
}

/** One agent run, from `GET /pulls/:id/runs` and `GET /runs/:id`. */
export interface RunSummary {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  status: string | null; // running | done | failed | cancelled
  error: string | null;
  findings_count: number | null;
  score: number | null;
  ran_at: string | null;
}

/** One finding inside a review. */
export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
  confidence: number;
}

/** A consolidated review for a PR, from `GET /pulls/:id/reviews`. */
export interface ReviewDto {
  id: string;
  pr_id: string;
  agent_id: string | null;
  agent_name?: string | null;
  run_id: string | null;
  kind: string;
  verdict: string | null;
  summary: string | null;
  score: number | null;
  created_at: string;
  findings: Finding[];
}

/** One extracted convention, from `GET /repos/:id/conventions`. */
export interface Convention {
  id: string;
  rule: string;
  category: string | null;
  status: ConventionStatus;
  confidence: number | null;
}

/** Response of `POST /pulls/:id/review` — fire-and-forget run trigger. */
export interface TriggerReviewResult {
  pr_id: string;
  runs: { run_id: string; agent_id: string; agent_name: string }[];
}

/** One caller of a changed symbol, from `GET /pulls/:id/blast`. */
export interface BlastCallerDto {
  name: string;
  file: string;
  line: number;
}

/** A changed symbol's downstream impact — who calls it + what it reaches. */
export interface DownstreamImpactDto {
  symbol: string;
  callers: BlastCallerDto[];
  endpoints_affected: string[];
  crons_affected: string[];
}

/** A symbol declared in a changed file. */
export interface ChangedSymbolDto {
  name: string;
  file: string;
  kind: string;
}

/** PR blast radius, from `GET /pulls/:id/blast`. Zero-LLM read of repo-intel. */
export interface BlastRadiusDto {
  changed_symbols: ChangedSymbolDto[];
  downstream: DownstreamImpactDto[];
  summary: string;
  /** True when the repo-intel index is absent/partial — panel shows a badge. */
  degraded?: boolean;
  reason?: string;
}

/**
 * The port. The concrete `HttpDevDigestApi` (Ring 3) implements it; everything
 * else depends only on this interface.
 */
export interface DevDigestApi {
  listAgents(): Promise<AgentSummary[]>;
  listRepos(): Promise<RepoRef[]>;
  listPulls(repoId: string): Promise<PrRef[]>;
  triggerReview(prId: string, agentId: string): Promise<TriggerReviewResult>;
  listRuns(prId: string): Promise<RunSummary[]>;
  /** Single-run status via `GET /runs/:id`; null on 404. */
  getRun(runId: string): Promise<RunSummary | null>;
  reviewsForPull(prId: string): Promise<ReviewDto[]>;
  listConventions(repoId: string): Promise<Convention[]>;
  /** PR blast radius via `GET /pulls/:id/blast`. */
  getBlastRadius(prId: string): Promise<BlastRadiusDto>;
}
