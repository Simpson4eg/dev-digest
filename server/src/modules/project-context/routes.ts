import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ContextDocListResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ProjectContextService } from './service.js';

/**
 * project-context module — markdown discovery for Project Context (AC-1..AC-3).
 *
 *   GET /repos/:id/context-docs
 *     → { docs: Array<{ path: string }> }
 *     Returns every .md under a configured folder name (specs/docs/insights by
 *     default) in the cloned repo, each with its repo-relative path.
 *     Empty repo or no matching folders → { docs: [] } (AC-3), never an error.
 *     Zero LLM calls (AC-13).
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ProjectContextService(container);

  app.get(
    '/repos/:id/context-docs',
    {
      schema: {
        params: IdParams,
        response: { 200: ContextDocListResponse },
      },
    },
    async (req): Promise<ContextDocListResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.listDocs(workspaceId, req.params.id);
    },
  );
}
