import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { BriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { getBrief } from './service.js';

/**
 * brief module (Lab 05) — Why + Risk Brief.
 *   POST /pulls/:id/brief → BriefResponse. Assembles the brief from already-built
 *   deterministic artifacts (intent L03 + blast L04 + smart-diff L03 + linked
 *   issue + project-context specs), spends EXACTLY ONE structured LLM call, grounds
 *   risks/focus against the blast+smart-diff evidence, and caches per PR. A cache
 *   hit costs zero LLM calls; `{ regenerate: true }` forces a single fresh call.
 *   PR resolution + 404 live in the service (getBrief) so this route stays thin.
 */
const BriefBody = z.object({ regenerate: z.boolean().optional() }).optional().default({});

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams, body: BriefBody } },
    async (req): Promise<BriefResponse> => {
      const { workspaceId } = await getContext(container, req);
      const regenerate = req.body?.regenerate ?? false;
      return getBrief(container, workspaceId, req.params.id, regenerate);
    },
  );
}
