import { z } from 'zod';
import type { ToolCtx, ToolDef } from './types.js';
import { ok, runTool } from './respond.js';
import { ToolError } from '../app/tool-error.js';
import { resolvePrBySlug } from '../app/resolve.js';
import { conciseReview, reviewForRun } from '../app/shaping.js';

const TERMINAL = new Set(['done', 'failed', 'cancelled']);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createRunAgentOnPr(ctx: ToolCtx): ToolDef {
  return {
    name: 'run_agent_on_pr',
    config: {
      description:
        'Run a review agent on a pull request and return its findings. Triggers the run, waits for it to finish, then returns verdict, score, summary and findings. If it is still running at timeout, returns {status:"running", run_id} — call get_findings later. Only tool that starts work; all others read.',
      inputSchema: {
        repo: z.string().describe('Repository as "owner/name"'),
        pr: z.number().int().positive().describe('Pull request number'),
        agent: z.string().describe('Agent id from list_agents'),
      },
      annotations: { title: 'Run a review agent on a PR', readOnlyHint: false },
    },
    handler: (args: { repo: string; pr: number; agent: string }) =>
      runTool(async () => {
        // "Error leads forward": an unknown agent id points back to list_agents.
        const agents = await ctx.api.listAgents();
        if (!agents.some((a) => a.id === args.agent)) {
          throw new ToolError(
            `Agent id "${args.agent}" was not found. Call list_agents to get a valid agent id.`,
          );
        }

        const { pr } = await resolvePrBySlug(ctx.api, args.repo, args.pr);
        const { runs } = await ctx.api.triggerReview(pr.id, args.agent);
        const run = runs[0];
        if (!run) {
          throw new ToolError(
            `The review did not start for agent "${args.agent}". Check it is enabled with list_agents.`,
          );
        }
        const runId = run.run_id;

        // "Result, not operation": trigger → wait (bounded) → collect findings.
        const deadline = Date.now() + ctx.config.runTimeoutMs;
        let status: string | null = 'running';
        let error: string | null = null;
        while (Date.now() < deadline) {
          await sleep(ctx.config.pollIntervalMs);
          const r = await ctx.api.getRun(runId);
          if (r) {
            status = r.status;
            error = r.error;
            if (status && TERMINAL.has(status)) break;
          }
        }

        if (status === 'done') {
          const reviews = await ctx.api.reviewsForPull(pr.id);
          const review = reviewForRun(reviews, runId, args.agent);
          if (!review) {
            return ok({
              status: 'done',
              run_id: runId,
              message: 'Run finished but no review was found. Try get_findings.',
            });
          }
          return ok({ status: 'done', run_id: runId, ...conciseReview(review) });
        }
        if (status === 'failed' || status === 'cancelled') {
          return ok({
            status,
            run_id: runId,
            error,
            message: `The run ${status}. See the DevDigest run trace for details.`,
          });
        }
        // Graceful fallback — client keeps its own tool-call timeout, so we
        // return before hitting it and hand off to get_findings.
        return ok({
          status: 'running',
          run_id: runId,
          message: `Still running after ${Math.round(ctx.config.runTimeoutMs / 1000)}s. Call get_findings with repo="${args.repo}" and pr=${args.pr} shortly.`,
        });
      }),
  };
}
