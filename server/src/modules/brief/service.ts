/**
 * service.ts — Why + Risk Brief orchestrator (Task 6 integrator).
 *
 * Pipeline:
 *   1. Cache check  (AC-11/12)  — zero LLM calls on hit
 *   2. Regenerate   (AC-13)     — invalidate + fresh path
 *   3. In-flight lock (AC-13b)  — one call for N concurrent regenerates
 *   4. Fresh path (best-effort reads, never throws — INSIGHTS 2026-07-04/07-05, AC-3)
 *      a. Read Intent, BlastRadius, SmartDiff, linked issue, spec texts
 *      b. Assemble (T3) — budget/truncate
 *      c. Empty short-circuit (AC-3b) — zero calls when fully empty
 *      d. Compose (T4) — exactly one LLM call (AC-6)
 *      e. Ground (T5) — drop ungrounded risks/focus (AC-8/9/10)
 *      f. Cache + observe (AC-17/18)
 *
 * Security: untrusted inputs are kept DISCRETE through to composeBrief, where
 * they are fenced individually by assemblePrompt/wrapUntrusted (SPEC-02, cross-model #1).
 *
 * In-flight lock assumption: single-node studio host (server AGENTS "API and web
 * run on the host"). A cross-process advisory lock is not needed for D7. If this
 * service is ever deployed multi-node, the Map-keyed lock must be replaced with a
 * distributed semaphore (e.g. advisory DB lock or Redis).
 */

import type { Container } from '../../platform/container.js';
import type { Brief, BriefResponse, BriefSource, Provider, RiskSeverity } from '@devdigest/shared';
import { composeBrief } from '@devdigest/reviewer-core';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ReviewRepository } from '../reviews/repository.js';
import { BlastService } from '../blast/service.js';
import { SmartDiffService } from '../smart-diff/service.js';
import { BriefRepository } from './repository.js';
import { assembleBriefInput, isFullyEmpty } from './assemble.js';
import { groundBrief } from './ground.js';
import { resolveEffectiveSet } from '../reviews/project-context.js';
import { filterContextPaths } from '../project-context/discover.js';
import { NotFoundError } from '../../platform/errors.js';

// ---- In-flight lock ----------------------------------------------------------

/**
 * Per-PR in-flight lock: keyed by "workspaceId:prId".
 * A second regenerate while one is in flight AWAITS the same promise —
 * one LLM call for N concurrent regenerates (AC-13b / D7).
 * Cleared in a `finally` block on settle.
 *
 * Single-node assumption (see module-level comment).
 */
const inFlight = new Map<string, Promise<BriefResponse>>();

// ---- Public API --------------------------------------------------------------

/**
 * Get (or compose) the Why + Risk Brief for a pull request.
 *
 * @param container    DI container.
 * @param workspaceId  Tenant scope (AC-14).
 * @param prId         PR database id.
 * @param regenerate   When true: invalidate the cache and force a fresh LLM call (AC-13).
 */
export async function getBrief(
  container: Container,
  workspaceId: string,
  prId: string,
  regenerate = false,
): Promise<BriefResponse> {
  const briefRepo = new BriefRepository(container.db);

  // Resolve the PR (proves it exists in this workspace) and read its current head
  // sha for outdated-detection (AC-14b). Uses the platform error taxonomy so the
  // route stays thin and the 404 body matches every other route.
  const pull = await new ReviewRepository(container.db).getPull(workspaceId, prId);
  if (!pull) throw new NotFoundError('Pull request not found');
  const currentHeadSha = pull.headSha;

  // ---- 1. Cache check (AC-11/12) -------------------------------------------
  if (!regenerate) {
    const cached = await briefRepo.getByPull(workspaceId, prId);
    if (cached) {
      const outdated = cached.builtHeadSha !== currentHeadSha;
      return buildResponse(cached.brief, {
        ref: cached.ref ?? undefined, // persisted blast ref survives the cache round-trip (AC-10)
        builtHeadSha: cached.builtHeadSha,
        outdated: outdated || undefined,
        source: cached.source,  // always 'cache' from getByPull (AC-18)
        inputTokens: cached.inputTokens ?? undefined,
        materialized: true,
      });
    }
  }

  // ---- 2. Regenerate: invalidate then run fresh path (AC-13) ----------------
  if (regenerate) {
    await briefRepo.invalidate(workspaceId, prId);
  }

  // ---- 3. In-flight lock (AC-13b / D7) -------------------------------------
  const lockKey = `${workspaceId}:${prId}`;
  const existing = inFlight.get(lockKey);
  if (existing) {
    // A concurrent regenerate for this PR is already in flight — join it.
    return existing;
  }

  // Not in flight: launch the fresh path and register the promise.
  const promise = runFreshPath(container, briefRepo, workspaceId, prId, currentHeadSha).finally(
    () => inFlight.delete(lockKey),
  );
  inFlight.set(lockKey, promise);
  return promise;
}

// ---- Fresh path --------------------------------------------------------------

/**
 * Run the full fresh-compose pipeline. Called ONLY when:
 *   - no cache hit, or
 *   - explicit regenerate (cache already invalidated before this call).
 *
 * Every artifact read is best-effort (try/catch → undefined); a failed read
 * omits that section from the assembled input but never fails the request (AC-3).
 * The WHOLE block is OUTSIDE any failAll (INSIGHTS 2026-07-04/07-05).
 */
async function runFreshPath(
  container: Container,
  briefRepo: BriefRepository,
  workspaceId: string,
  prId: string,
  currentHeadSha: string,
): Promise<BriefResponse> {
  const reviewRepo = new ReviewRepository(container.db);

  // ---- 4a. Best-effort artifact reads ---------------------------------------

  // Intent (pr_intent table via ReviewRepository.getIntent)
  let intent: Awaited<ReturnType<typeof reviewRepo.getIntent>> = undefined;
  try {
    intent = await reviewRepo.getIntent(prId);
  } catch {
    // degraded — no intent section
  }

  // BlastRadius (BlastService.forPull — may throw if PR not found)
  const blastService = new BlastService(container);
  let blast: Awaited<ReturnType<BlastService['forPull']>> | undefined = undefined;
  try {
    blast = await blastService.forPull(workspaceId, prId);
  } catch {
    // degraded — no blast section
  }

  // SmartDiff (SmartDiffService.forPull)
  const smartDiffService = new SmartDiffService(container);
  let smartDiff: Awaited<ReturnType<SmartDiffService['forPull']>> | undefined = undefined;
  try {
    smartDiff = await smartDiffService.forPull(workspaceId, prId);
  } catch {
    // degraded — no smart-diff section
  }

  // Linked issue text — read from pull.body via GitHub API (best-effort)
  let linkedIssueText: string | undefined = undefined;
  try {
    const pull = await reviewRepo.getPull(workspaceId, prId);
    if (pull?.body) {
      const repo = await reviewRepo.getRepo(pull.repoId);
      if (repo) {
        const gh = await container.github();
        const issue = await gh.resolveLinkedIssue({ owner: repo.owner, name: repo.name }, pull.body);
        if (issue?.body?.trim()) {
          linkedIssueText = issue.body.trim();
        }
      }
    }
  } catch {
    // degraded — no linked issue section
  }

  // Project Context spec texts — REUSE the SPEC-01 mechanism
  // (resolveEffectiveSet → filterContextPaths → git.readFile,
  //  run-executor.ts:237-278). Best-effort for the entire block.
  let specTexts: Array<{ filename: string; text: string }> | undefined = undefined;
  try {
    const pull = await reviewRepo.getPull(workspaceId, prId);
    if (pull) {
      const repo = await reviewRepo.getRepo(pull.repoId);
      if (repo) {
        // Use the first active agent's doc set for the workspace (best-effort).
        // This mirrors how the run-executor picks up project-context: each agent
        // carries its own doc links. For the brief we use the workspace's first
        // enabled agent. If none exist, spec texts are simply omitted (AC-3).
        const agents = await container.agentsRepo.list(workspaceId);
        const enabledAgent = agents.find((a: { enabled?: boolean }) => a.enabled !== false);
        if (enabledAgent) {
          const agentDocRows = await container.agentsRepo.linkedContextDocs(
            workspaceId,
            enabledAgent.id,
          );
          const agentPaths = agentDocRows.map((r: { path: string }) => r.path);

          // Skill-inherited paths: enabled skills linked to this agent.
          const linkedSkills = await container.agentsRepo.linkedSkills(
            workspaceId,
            enabledAgent.id,
          );
          const enabledSkillLinks = linkedSkills.filter(
            (link: { skill: { enabled?: boolean } }) => link.skill.enabled !== false,
          );
          const skillDocInputs = await Promise.all(
            enabledSkillLinks.map(async (link: { skill: { id: string } }) => {
              const rows = await container.skillsRepo.linkedContextDocs(
                workspaceId,
                link.skill.id,
              );
              return { skillId: link.skill.id, paths: rows.map((r: { path: string }) => r.path) };
            }),
          );

          const effectivePaths = resolveEffectiveSet(agentPaths, skillDocInputs);
          const safePaths = filterContextPaths(effectivePaths, container.config.contextFolderNames);

          if (safePaths.length > 0) {
            const readResults = await Promise.allSettled(
              safePaths.map((path) =>
                container.git.readFile({ owner: repo.owner, name: repo.name }, path),
              ),
            );
            const texts: Array<{ filename: string; text: string }> = [];
            for (let i = 0; i < safePaths.length; i++) {
              const result = readResults[i]!;
              if (result.status === 'fulfilled') {
                texts.push({ filename: safePaths[i]!, text: result.value });
              }
            }
            if (texts.length > 0) specTexts = texts;
          }
        }
      }
    }
  } catch {
    // degraded — no spec texts
  }

  // ---- 4b. Assemble (T3) -----------------------------------------------------
  const assembled = assembleBriefInput(
    {
      intent: intent ?? undefined,
      blast: blast ?? undefined,
      smartDiff: smartDiff ?? undefined,
      linkedIssueText,
      specTexts,
    },
    (text) => container.tokenizer.count(text),
  );

  const inputTokens = assembled.tokenCount; // AC-17

  // ---- 4c. Empty short-circuit (AC-3b / D5) ----------------------------------
  if (
    isFullyEmpty({
      intent: intent ?? undefined,
      blast: blast ?? undefined,
      smartDiff: smartDiff ?? undefined,
      linkedIssueText,
    })
  ) {
    // Zero LLM calls. Build and cache the "not enough signal yet" empty brief.
    const emptyBrief: Brief = {
      what: 'Not enough signal yet — no intent, blast data, or smart-diff overlay available.',
      why: '',
      risk_level: 'low' as RiskSeverity,
      risks: [],
      review_focus: [],
    };
    await briefRepo.upsert(workspaceId, prId, emptyBrief, currentHeadSha, inputTokens, 'fresh');
    return buildResponse(emptyBrief, {
      builtHeadSha: currentHeadSha,
      source: 'fresh',
      inputTokens,
      materialized: false,
    });
  }

  // ---- 4d. Serialize assembled blast + smart-diff for compose ----------------
  // T4 (composeBrief) wants blastAndDiffSummary as ONE opaque string (the `diff`
  // slot in assemblePrompt). We merge the blast summary and smart-diff stats here;
  // the untrusted discrete fields (intentText, linkedIssueBody, specTexts) pass
  // through separately so T4 can fence them individually (cross-model #1).
  const blastAndDiffSummary = serializeBlastAndDiff(assembled);

  // ---- 4e. Compose (AC-6) — exactly one LLM call ----------------------------
  const featureModel = await resolveFeatureModel(container, workspaceId, 'risk_brief');
  const llm = await container.llm(featureModel.provider as Provider);

  const composed = await composeBrief({
    llm,
    model: featureModel.model,
    intentText: assembled.intentText,
    linkedIssueBody: assembled.linkedIssueText,
    specTexts: assembled.specTexts?.map((s) => `[${s.filename}]\n${s.text}`),
    blastAndDiffSummary,
  });

  // ---- 4f. Ground (AC-8/9/10) ------------------------------------------------
  const groundingResult = groundBrief(
    composed.brief.risks,
    composed.brief.review_focus,
    blast,
    smartDiff,
  );

  // Store blast ref on the record so caller-file links anchor to the indexed
  // commit sha (AC-10). When isCallerFileRef is true for any survivor, we use
  // blast.ref. This is stored on BriefResponse.ref for the client.
  const blastRef = blast?.ref;
  const hasCallerRef =
    groundingResult.groundedRisks.some((r) => r.isCallerFileRef) ||
    groundingResult.groundedFocus.some((f) => f.isCallerFileRef);

  // Build the grounded brief (plain shapes for caching)
  const groundedBrief: Brief = {
    what: composed.brief.what,
    why: composed.brief.why,
    risk_level: composed.brief.risk_level,
    risks: groundingResult.groundedRisks.map((r) => r.risk),
    review_focus: groundingResult.groundedFocus.map((f) => f.focus),
  };

  // ---- 4g. Cache + observe (AC-17/18) ----------------------------------------
  // Persist the blast ref (when a survivor is a caller-file ref) so a later cache
  // hit keeps the indexed-commit anchor for click-to-code (AC-10).
  const storedRef = hasCallerRef ? (blastRef ?? null) : null;
  await briefRepo.upsert(
    workspaceId,
    prId,
    groundedBrief,
    currentHeadSha,
    inputTokens,
    'fresh',
    storedRef,
  );

  return buildResponse(groundedBrief, {
    ref: hasCallerRef ? blastRef : undefined,
    builtHeadSha: currentHeadSha,
    source: 'fresh',
    inputTokens,
    materialized: true,
  });
}

// ---- Helpers -----------------------------------------------------------------

/** Merge blast + smart-diff stats into a single opaque string for the T4 `diff` slot.
 * Keeps untrusted text (intentText, linkedIssueText, specTexts) SEPARATE — they
 * go into their own assemblePrompt slots (cross-model #1, SPEC-02).
 */
function serializeBlastAndDiff(
  assembled: ReturnType<typeof assembleBriefInput>,
): string {
  const parts: string[] = [];

  parts.push(`blast_summary: ${assembled.blastSummary}`);

  if (assembled.changedSymbols.length > 0) {
    parts.push(
      `changed_symbols: ${assembled.changedSymbols.map((s) => `${s.name} (${s.file})`).join(', ')}`,
    );
  }

  if (assembled.downstream.length > 0) {
    const ds = assembled.downstream.map((d) => {
      const callers = d.callers
        .map((c) => `${c.name} at ${c.file}:${c.line}`)
        .join('; ');
      return `${d.symbol}: callers=[${callers}] endpoints=[${d.endpoints_affected.join(', ')}]`;
    });
    parts.push(`downstream: ${ds.join(' | ')}`);
  }

  if (assembled.endpointsAffected.length > 0) {
    parts.push(`endpoints_affected: ${assembled.endpointsAffected.join(', ')}`);
  }
  if (assembled.cronsAffected.length > 0) {
    parts.push(`crons_affected: ${assembled.cronsAffected.join(', ')}`);
  }

  if (assembled.priorPrs && assembled.priorPrs.length > 0) {
    const prs = assembled.priorPrs.map(
      (p) => `PR#${p.pr_number} "${p.title}" by ${p.author} (${p.merged_at})`,
    );
    parts.push(`prior_prs: ${prs.join(' | ')}`);
  }

  if (assembled.smartDiffGroups.length > 0) {
    const groups = assembled.smartDiffGroups.map((g) => {
      const files = g.files
        .map((f) => `${f.path} +${f.additions} -${f.deletions} findings:${f.finding_lines_count}`)
        .join('; ');
      return `${g.role}: [${files}]`;
    });
    parts.push(`smart_diff: ${groups.join(' | ')}`);
  }

  return parts.join('\n');
}

/** Build the BriefResponse envelope from a Brief + metadata. */
function buildResponse(
  brief: Brief,
  meta: {
    ref?: string;
    builtHeadSha?: string;
    outdated?: boolean;
    source?: BriefSource;
    inputTokens?: number;
    materialized: boolean;
  },
): BriefResponse {
  return {
    ...brief,
    ref: meta.ref ?? null,
    built_head_sha: meta.builtHeadSha ?? null,
    outdated: meta.outdated ?? null,
    source: meta.source ?? null,
    input_tokens: meta.inputTokens ?? null,
    materialized: meta.materialized,
  };
}
