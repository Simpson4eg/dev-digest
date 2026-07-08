import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module (Lab 04) — PR blast radius.
 *   GET /pulls/:id/blast → BlastRadius: changed symbols → their downstream
 *                          callers (file:line) → impacted endpoints/crons,
 *                          read straight from the repo-intel index. NO LLM
 *                          call, no persistence — the feature is free by tokens.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams } },
    async (req): Promise<BlastRadius> => {
      const { workspaceId } = await getContext(container, req);
      return service.forPull(workspaceId, req.params.id);
    },
  );
}
