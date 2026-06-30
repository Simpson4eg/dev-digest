import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UpdateConventionBody, CreateConventionSkillBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  /** Trigger extraction for a repo. Clears previous candidates and re-runs. */
  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidates = await service.extract(workspaceId, req.params.id);
      return { repo_id: req.params.id, candidates };
    },
  );

  /** List all convention candidates for a repo. */
  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidates = await service.list(workspaceId, req.params.id);
      return candidates;
    },
  );

  /** Accept, reject, or edit a single candidate. */
  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.update(workspaceId, req.params.id, {
        status: req.body.status,
        rule: req.body.rule,
        category: req.body.category,
      });
      if (!candidate) throw new NotFoundError('Convention not found');
      return candidate;
    },
  );

  /** Create a merged skill from selected accepted candidates. */
  app.post(
    '/conventions/skill',
    { schema: { body: CreateConventionSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkillFromConventions(workspaceId, {
        repoId: req.body.repo_id,
        conventionIds: req.body.convention_ids,
        name: req.body.name,
        description: req.body.description,
        body: req.body.body,
        type: req.body.type,
        enabled: req.body.enabled,
      });
      reply.status(201);
      return skill;
    },
  );
}
