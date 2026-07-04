import { isAbsolute } from 'node:path';
import type { Container } from '../../platform/container.js';
import type { Intent, Provider, Review, RunTrace, UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, extractIntent, diffSkeleton, countBlockers, type ReviewEvent } from '@devdigest/reviewer-core';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { RunLogger } from '../../platform/run-logger.js';
import * as schema from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { REVIEW_STRATEGY } from './constants.js';
import { taskLine } from './helpers.js';
import { loadDiff } from './diff-loader.js';

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/** Compact, prompt-ready rendering of a derived Intent (motivation + scope). */
function renderIntent(intent: Intent): string {
  const parts = [intent.intent.trim()];
  if (intent.in_scope.length > 0) {
    parts.push(`In scope:\n${intent.in_scope.map((s) => `- ${s}`).join('\n')}`);
  }
  if (intent.out_of_scope.length > 0) {
    parts.push(`Out of scope:\n${intent.out_of_scope.map((s) => `- ${s}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
    private agents: Container['agentsRepo'],
  ) {}

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    jobs: { agent: AgentRow; runId: string }[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = new RunLogger(
      this.container.runBus,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
          })
          .catch(() => undefined);
        await this.repo
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        this.container.runBus.complete(runId);
      }
    };

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.container, this.repo, workspaceId, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    // Intent Layer — a cheap pre-review pass shared by every queued run: derive
    // the PR's motivation + scope from its body + diff, persist it, and feed it
    // (as untrusted context) into each agent's prompt. Best-effort: an intent
    // failure NEVER fails the review (it is enrichment, like the callers digest),
    // so it is intentionally OUTSIDE the failAll path.
    const intentText = await this.deriveIntent(workspaceId, pull, repo, diff, runLog);

    for (const { agent, runId } of jobs) {
      const agentStart = Date.now();
      logger?.info(
        { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
        `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
      );
      try {
        const outcome = await this.runOneAgent(workspaceId, pull, repo, diff, agent, runId, runLog, intentText);
        logger?.info(
          {
            runId,
            agent: agent.name,
            findings: outcome.findings.length,
            grounding: outcome.grounding,
            durationMs: Date.now() - agentStart,
          },
          `review: agent "${agent.name}" done — ${outcome.findings.length} finding(s)`,
        );
      } catch (err) {
        // runOneAgent already persisted the failure/cancel (status + error +
        // trace) and completed the bus; here we only log at the run level.
        const cancelled = err instanceof RunCancelledError;
        logger?.[cancelled ? 'info' : 'error'](
          { runId, agent: agent.name, err: (err as Error).message, durationMs: Date.now() - agentStart },
          `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
        );
      }
    }
  }

  /** Execute a single agent's review against a PR, streaming progress. */
  private async runOneAgent(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    agent: AgentRow,
    runId: string,
    parentLog: RunLogger,
    intentText?: string,
  ): Promise<RunOutcome> {
    const start = Date.now();
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace below
    // (built from the buffer) includes them too.
    const runLog = parentLog.forRun(runId, { agent: agent.name });
    let appliedSkills: { id: string; name: string; version: number; body: string }[] = [];

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    try {
      // Resolve the agent's LLM provider. (container.llm throws if the provider
      // key is missing — caught below and persisted as a failed run.)
      const llm = await runLog.step(
        `Resolving ${agent.provider} provider`,
        () => this.container.llm(agent.provider as Provider),
        { kind: 'tool' },
      );

      const linkedSkills = await runLog.step(
        'Loading linked skills',
        () => this.agents.linkedSkills(workspaceId, agent.id),
        { kind: 'tool' },
      );
      appliedSkills = linkedSkills
        .filter((link) => link.skill.enabled)
        .map((link) => ({
          id: link.skill.id,
          name: link.skill.name,
          version: link.skill.version,
          body: `## Skill: ${link.skill.name} (v${link.skill.version})\n${link.skill.body}`,
        }));
      const disabledCount = linkedSkills.length - appliedSkills.length;
      runLog.info(
        `Skills: ${appliedSkills.length} enabled in prompt${disabledCount > 0 ? `, ${disabledCount} globally disabled` : ''}`,
      );

      // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
      // skip all enrichment entirely so its prompt is identical to the
      // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
      // flag, which still gates the facade internally.
      const repoIntelOn = agent.repoIntel !== false;
      if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

      // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
      // returns []; we omit the section and behavior is identical to the
      // pre-T1.3 prompt (acceptance #10).
      const callersDigest = repoIntelOn
        ? await this.buildCallersDigest(pull.repoId, diff, runLog)
        : undefined;

      // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
      // effort: when repo-intel is off / unindexed the facade degrades and the
      // prompt is identical to the pre-T3 shape.
      const repoMap = repoIntelOn ? await this.buildRepoMapDigest(pull.repoId, runLog) : undefined;
      const rankNote = repoIntelOn ? await this.buildRankNote(pull.repoId, diff, runLog) : '';

      const task = taskLine(pull) + rankNote;

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        ...(appliedSkills.length > 0 ? { skills: appliedSkills.map((skill) => skill.body) } : {}),
        // Per-agent review strategy (configured in the Agent editor); falls back
        // to the studio default. single-pass = whole diff in one call.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        // Intent Layer — derived motivation + scope (untrusted). Omitted when the
        // pre-work intent pass produced nothing (missing key, LLM error, …).
        ...(intentText ? { intent: intentText } : {}),
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.container.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
      const { tokensIn, tokensOut, grounding } = outcome;

      const keptFindings = outcome.review.findings;

      // ---- Persist review + findings ----------------------------------------
      const review = await this.repo.insertReview({
        workspaceId,
        prId: pull.id,
        agentId: agent.id,
        runId,
        kind: 'review',
        verdict: outcome.review.verdict,
        summary: outcome.review.summary,
        score: outcome.review.score,
        model: agent.model,
      });
      const findingRows = await this.repo.insertFindings(review.id, keptFindings);
      runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

      // Mark the commit this review ran against so the PR list can tell
      // reviewed / needs-review (head moved) / stale apart.
      await this.repo.markReviewed(pull.id, pull.headSha);

      const durationMs = Date.now() - start;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(keptFindings, agent.ciFailOn);

      // ---- Observability: agent_runs + ONE run_traces document --------------
      await this.repo.completeAgentRun(runId, {
        status: 'done',
        durationMs,
        tokensIn,
        tokensOut,
        findingsCount: findingRows.length,
        grounding,
        score: outcome.review.score,
        blockers,
        error: null,
      });

      const trace: RunTrace = {
        config: {
          agent: agent.name,
          version: String(agent.version),
          provider: agent.provider,
          model: agent.model,
          pr: pull.number,
          source: 'local',
          skills: appliedSkills.map(({ id, name, version }) => ({ id, name, version })),
        },
        stats: {
          duration_ms: durationMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          findings: findingRows.length,
          grounding,
        },
        prompt_assembly: {
          ...outcome.assembly,
          skill_tokens: outcome.assembly.skills
            ? this.container.tokenizer.count(outcome.assembly.skills)
            : 0,
        },
        tool_calls: outcome.chunks.map((c) => ({
          tool: 'review_file',
          args: c.label,
          meta: outcome.mode,
          ms: Math.round(durationMs / Math.max(outcome.chunks.length, 1)),
        })),
        raw_output: outcome.raw,
        memory_pulled: [],
        specs_read: [],
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      };
      runLog.info('Run complete; trace persisted');
      await this.repo.saveRunTrace(runId, trace);
      this.container.runBus.complete(runId);

      return { review, findings: findingRows, grounding, raw: outcome.review };
    } catch (err) {
      // Failure/cancel: persist status + the error text + the log-so-far so the
      // run (and WHY it failed) is visible on the UI after a reload.
      const cancelled = err instanceof RunCancelledError;
      const status = cancelled ? 'cancelled' : 'failed';
      const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
      runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
      await this.repo
        .completeAgentRun(runId, {
          status,
          durationMs: Date.now() - start,
          tokensIn: 0,
          tokensOut: 0,
          findingsCount: 0,
          grounding: '0/0 passed',
          error: msg,
        })
        .catch(() => undefined);
      await this.repo
        .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed', Date.now() - start))
        .catch(() => undefined);
      this.container.runBus.complete(runId);
      throw err;
    }
  }

  /**
   * Core intent computation — shared by the best-effort pre-work path
   * (`deriveIntent`) and the explicit regenerate endpoint (`recomputeIntent`).
   * Callers own error handling. Persists the result via `upsertIntent`.
   */
  private async computeIntent(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    logInfo: (msg: string) => void,
    onEvent: (e: ReviewEvent) => void,
  ): Promise<Intent> {
    const im = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const llm = await this.container.llm(im.provider as Provider);

    // ---- Gather plan[] best-effort from three sources -------------------------
    const plan: string[] = [];

    // Source 1: Linked ticket/issue — via the GitHubClient port (T7: de-duplicated
    // from the private resolveLinkedIssue in octokit.ts).
    if (pull.body) {
      try {
        const gh = await this.container.github();
        const issue = await gh.resolveLinkedIssue({ owner: repo.owner, name: repo.name }, pull.body);
        if (issue) {
          const block = `Linked ticket #${issue.number} -- ${issue.title}\n${issue.body ?? ''}`;
          if (block.trim().length > 0) plan.push(block);
        }
      } catch (err) {
        logInfo(`intent: linked issue skipped -- ${(err as Error).message}`);
      }
    }

    // Source 2: Linked repo spec/plan file -- scan PR body for repo-relative
    // markdown/text paths. Cap each file at 8000 chars. Up to 2 distinct paths.
    if (pull.body) {
      try {
        const rawPaths: string[] = [];
        const mdLinkRe = /\[[^\]]*\]\(([^)]+)\)/g;
        let mdMatch: RegExpExecArray | null;
        while ((mdMatch = mdLinkRe.exec(pull.body)) !== null) {
          rawPaths.push(mdMatch[1]!);
        }
        const bareRe = /\b([\w./-]+\.(?:md|mdx|txt|rst))\b/g;
        let bareMatch: RegExpExecArray | null;
        while ((bareMatch = bareRe.exec(pull.body)) !== null) {
          rawPaths.push(bareMatch[1]!);
        }

        // Filter: keep only repo-relative paths (no http(s)://, no .., no absolute/rooted).
        const seen = new Set<string>();
        const candidatePaths = rawPaths
          .map((p) => p.trim())
          .filter((p) => {
            if (!p) return false;
            if (/^https?:\/\//i.test(p)) return false;
            if (p.includes('..')) return false;
            if (isAbsolute(p)) return false;
            if (/^[/\\]/.test(p)) return false;
            if (/^[a-zA-Z]:/.test(p)) return false;
            if (!/\.(?:md|mdx|txt|rst)$/i.test(p)) return false;
            const normalized = p.replace(/^\.\//, '');
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
          })
          .slice(0, 2);

        for (const filePath of candidatePaths) {
          try {
            const text = await this.container.git.readFile(
              { owner: repo.owner, name: repo.name },
              filePath,
            );
            const capped = text.slice(0, 8000);
            if (capped.trim().length > 0) {
              plan.push(`Spec file ${filePath}:\n${capped}`);
            }
          } catch (err) {
            logInfo(`intent: spec file ${filePath} skipped -- ${(err as Error).message}`);
          }
        }
      } catch (err) {
        logInfo(`intent: spec file scan skipped -- ${(err as Error).message}`);
      }
    }

    // Source 3: Embedded long plan
    if (pull.body && pull.body.length > 4000) {
      const block = `Full PR description:\n${pull.body}`;
      if (block.trim().length > 0) plan.push(block);
    }

    const cleanPlan = plan.filter((b) => b.trim().length > 0);
    if (cleanPlan.length > 0) {
      logInfo(`intent: attached ${cleanPlan.length} plan/spec source(s)`);
    }
    // ---- end gather ----------------------------------------------------------

    const res = await extractIntent({
      llm,
      model: im.model,
      diff,
      title: pull.title,
      ...(pull.body ? { prDescription: pull.body } : {}),
      ...(cleanPlan.length > 0 ? { plan: cleanPlan } : {}),
      sessionId: `${repo.owner}/${repo.name}#${pull.number}:intent`,
      onEvent,
    });

    // T2 — log how many tokens the skeleton saves vs the full diff body.
    try {
      const skeleton = diffSkeleton(diff);
      const full = this.container.tokenizer.count(diff.raw);
      const skeletonTokens = this.container.tokenizer.count(skeleton);
      logInfo(`intent: diff skeleton saved ~${full - skeletonTokens} tokens (${full}->${skeletonTokens})`);
    } catch {
      // tokenizer failure is non-fatal
    }

    await this.repo.upsertIntent(pull.id, res.intent);
    return res.intent;
  }

  /**
   * Intent Layer pre-work: derive the PR's motivation + scope ONCE (shared by
   * every queued run), persist it (`pr_intent`), and return a compact rendering
   * to feed into each agent's prompt.
   *
   * Best-effort — any failure returns `undefined` so the review proceeds as
   * before. Uses the workspace's `review_intent` model choice (Settings).
   */
  private async deriveIntent(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const intent = await this.computeIntent(
        workspaceId, pull, repo, diff,
        (msg) => runLog.info(msg),
        (e) => runLog.event(e.kind, e.msg, e.data),
      );
      return renderIntent(intent);
    } catch (err) {
      runLog.info(`intent: skipped -- ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * Explicit intent recompute (for the `POST /pulls/:id/intent/regenerate`
   * endpoint). Unlike `deriveIntent`, errors propagate to the caller so the
   * HTTP handler can surface them as a 4xx/5xx. No SSE bus — the result is
   * returned synchronously in the HTTP response.
   */
  async recomputeIntent(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
  ): Promise<Intent> {
    return this.computeIntent(workspaceId, pull, repo, diff, () => undefined, () => undefined);
  }

  /**
   * Build a compact "Callers of changed symbols" digest for the prompt.
   *
   * Returns `undefined` when nothing should be added (flag off, no callers
   * found, or repo-intel errors) — `reviewPullRequest` omits the section in
   * that case (acceptance #10: flag off → identical prompt).
   *
   * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
   * rows per `getCallerSignatures` call) so the section stays under ~600
   * tokens even on heavy PRs.
   */
  private async buildCallersDigest(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return undefined;
    let rows;
    try {
      rows = await this.container.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    const byFile = new Map<string, string[]>();
    for (const r of rows) {
      const lines = byFile.get(r.file) ?? [];
      lines.push(`- \`${r.symbol}\` — ${r.signature}`);
      byFile.set(r.file, lines);
    }
    const out: string[] = [];
    for (const [file, lines] of byFile) {
      out.push(`### ${file}`);
      out.push(...lines);
    }
    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return out.join('\n');
  }

  /**
   * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
   * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
   * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
   */
  private async buildRepoMapDigest(
    repoId: string,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const map = await this.container.repoIntel.getRepoMap(repoId);
      if (map.degraded || map.text.trim().length === 0) return undefined;
      runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
      return map.text;
    } catch (err) {
      runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
   * note appended to the task framing, so the model prioritises hot core files.
   * Empty string when repo-intel is off / no changed file is hot.
   */
  private async buildRankNote(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return '';
    try {
      const ranks = await this.container.repoIntel.getFileRank(repoId, changedFiles);
      if (ranks.length === 0) return '';
      const hot = ranks.filter((r) => r.percentile >= 95);
      if (hot.length === 0) return '';
      runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
      return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
    } catch {
      return '';
    }
  }

  /**
   * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
   * failure/cancel (and pre-work failures) so the events (and WHY it failed)
   * survive a reload, not just the in-memory stream.
   */
  private traceFromBuffer(
    runId: string,
    pull: PullRow,
    agent: AgentRow,
    grounding: string,
    durationMs = 0,
  ): RunTrace {
    return {
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
      },
      stats: { duration_ms: durationMs, tokens_in: 0, tokens_out: 0, findings: 0, grounding },
      prompt_assembly: { system: agent.systemPrompt, skills: null, memory: null, specs: null, user: '' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: this.container.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    };
  }
}
