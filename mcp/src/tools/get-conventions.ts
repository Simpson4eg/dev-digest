import { z } from 'zod';
import type { ToolCtx, ToolDef } from './types.js';
import { ok, runTool } from './respond.js';
import { resolveRepo } from '../app/resolve.js';
import { conventionsSummary, paginate } from '../app/shaping.js';

export function createGetConventions(ctx: ToolCtx): ToolDef {
  return {
    name: 'get_conventions',
    config: {
      description:
        'Get the coding conventions extracted for a repository, grouped by status and category, with the top rules. Pass detail:true for the full list. If none exist yet, extract conventions for the repo first.',
      inputSchema: {
        repo: z.string().describe('Repository as "owner/name"'),
        status: z
          .enum(['candidate', 'accepted', 'rejected'])
          .optional()
          .describe('Filter by convention status'),
        detail: z.boolean().optional().describe('Return the full conventions list'),
        limit: z.number().int().positive().max(200).optional().describe('Page size for detail (default 50)'),
        cursor: z.string().optional().describe('Pagination cursor from a previous call'),
      },
      annotations: { title: 'Get repository conventions', readOnlyHint: true },
    },
    handler: (args: {
      repo: string;
      status?: 'candidate' | 'accepted' | 'rejected';
      detail?: boolean;
      limit?: number;
      cursor?: string;
    }) =>
      runTool(async () => {
        const repo = await resolveRepo(ctx.api, args.repo);
        let list = await ctx.api.listConventions(repo.id);
        if (args.status) list = list.filter((c) => c.status === args.status);

        if (list.length === 0) {
          return ok({
            total: 0,
            message: 'No conventions found for this repo. Extract conventions for it in DevDigest first.',
          });
        }

        const summary = conventionsSummary(list);
        if (!args.detail) return ok(summary);
        const page = paginate(
          list.map((c) => ({
            id: c.id,
            rule: c.rule,
            category: c.category,
            status: c.status,
            confidence: c.confidence,
          })),
          args.limit ?? 50,
          args.cursor,
        );
        return ok({ ...summary, conventions: page.items, nextCursor: page.nextCursor });
      }),
  };
}
