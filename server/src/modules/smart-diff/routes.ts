import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * smart-diff module (Lab 03) — risk-ordered diff layout.
 *   GET /pulls/:id/smart-diff → SmartDiff: groups[core|wiring|boilerplate] +
 *                               split_suggestion, composed deterministically
 *                               from the PR's files + its latest review's
 *                               findings. NO LLM call, no persistence — the
 *                               feature is free by tokens.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SmartDiffService(container);

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams } },
    async (req): Promise<SmartDiffResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.forPull(workspaceId, req.params.id);
    },
  );
}
