import { z } from 'zod';
import type { ToolCtx, ToolDef } from './types.js';
import { ok, runTool } from './respond.js';
import { resolvePrBySlug } from '../app/resolve.js';
import { blastRadiusView } from '../app/shaping.js';

/**
 * get_blast_radius — the files and downstream code a PR's changes can break.
 * Resolves the "owner/name" + PR number to an internal id, reads the zero-LLM
 * blast radius from `GET /pulls/:id/blast`, and returns a summary-first view:
 * changed symbols → their callers (file:line) → impacted endpoints/crons.
 */
export function createGetBlastRadius(ctx: ToolCtx): ToolDef {
  return {
    name: 'get_blast_radius',
    config: {
      description:
        "Get a pull request's blast radius — the changed symbols, who calls them downstream (file:line), and the HTTP endpoints / cron jobs those callers reach. Read straight from the repo-intel index (no LLM). If the repo isn't indexed yet the result is tagged `degraded` with a reason.",
      inputSchema: {
        repo: z.string().describe('Repository as "owner/name"'),
        pr: z.number().int().positive().describe('Pull request number'),
      },
      annotations: { title: 'Get PR blast radius', readOnlyHint: true },
    },
    handler: (args: { repo: string; pr: number }) =>
      runTool(async () => {
        const { pr } = await resolvePrBySlug(ctx.api, args.repo, args.pr);
        const blast = await ctx.api.getBlastRadius(pr.id);
        return ok(blastRadiusView(blast));
      }),
  };
}
