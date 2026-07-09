import { z } from 'zod';
import type { ToolCtx, ToolDef } from './types.js';
import { ok, runTool } from './respond.js';
import { resolvePrBySlug } from '../app/resolve.js';
import { conciseFinding, findingsSummary, latestReview, matchSeverity, paginate } from '../app/shaping.js';

export function createGetFindings(ctx: ToolCtx): ToolDef {
  return {
    name: 'get_findings',
    config: {
      description:
        'Get review results for a pull request already reviewed. Returns a concise verdict, score, summary and a severity breakdown of findings. Pass detail:true for the full list. If no review exists yet, run run_agent_on_pr first.',
      inputSchema: {
        repo: z.string().describe('Repository as "owner/name"'),
        pr: z.number().int().positive().describe('Pull request number'),
        agent: z.string().optional().describe('Limit to one agent id'),
        severity: z
          .enum(['CRITICAL', 'WARNING', 'SUGGESTION'])
          .optional()
          .describe('Filter findings by severity'),
        detail: z.boolean().optional().describe('Return the full findings list'),
        limit: z.number().int().positive().max(100).optional().describe('Page size for detail (default 20)'),
        cursor: z.string().optional().describe('Pagination cursor from a previous call'),
      },
      annotations: { title: 'Get review findings for a PR', readOnlyHint: true },
    },
    handler: (args: {
      repo: string;
      pr: number;
      agent?: string;
      severity?: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
      detail?: boolean;
      limit?: number;
      cursor?: string;
    }) =>
      runTool(async () => {
        const { pr } = await resolvePrBySlug(ctx.api, args.repo, args.pr);
        let reviews = await ctx.api.reviewsForPull(pr.id);
        if (args.agent) reviews = reviews.filter((r) => r.agent_id === args.agent);

        const review = latestReview(reviews);
        if (!review) {
          const runs = await ctx.api.listRuns(pr.id);
          const running = runs.some((r) => r.status === 'running');
          return ok({
            runStatus: running ? 'running' : 'none',
            message: running
              ? 'A review is still running for this PR. Try again shortly.'
              : 'No review found for this PR. Run run_agent_on_pr first.',
          });
        }

        const filtered = matchSeverity(review.findings, args.severity);
        const base = {
          runStatus: 'done',
          verdict: review.verdict,
          score: review.score,
          summary: review.summary,
          agent: review.agent_name ?? review.agent_id,
          findings_summary: findingsSummary(review.findings),
          total: filtered.length,
        };
        if (!args.detail) return ok(base);
        const page = paginate(filtered.map(conciseFinding), args.limit ?? 20, args.cursor);
        return ok({ ...base, findings: page.items, nextCursor: page.nextCursor });
      }),
  };
}
