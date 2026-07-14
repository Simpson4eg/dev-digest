import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  SkillContextDocsResponse,
  SkillContextDocsSetRequest,
  SkillSource,
  SkillType,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { previewSkillImport } from './importer.js';
import { SkillsService } from './service.js';

const SkillFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  type: SkillType,
  body: z.string().trim().min(1).max(262_144),
  enabled: z.boolean(),
};

const CreateSkillBody = z.object({
  ...SkillFields,
  source: SkillSource.optional(),
  enabled: SkillFields.enabled.optional(),
});

const UpdateSkillBody = z.object({
  name: SkillFields.name.optional(),
  description: SkillFields.description.optional(),
  type: SkillFields.type.optional(),
  body: SkillFields.body.optional(),
  enabled: SkillFields.enabled.optional(),
});

const ImportPreviewBody = z.object({
  filename: z.string().trim().min(1).max(255),
  content_base64: z.string().min(1).max(1_500_000),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/skills/import/preview', { bodyLimit: 1_600_000, schema: { body: ImportPreviewBody } }, async (req) => {
    await getContext(app.container, req);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(req.body.content_base64)) {
      throw new ValidationError('Invalid base64 file content');
    }
    return previewSkillImport(req.body.filename, Buffer.from(req.body.content_base64, 'base64'));
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    if (!(await service.delete(workspaceId, req.params.id))) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  // ---- Context-doc attachment (Task 5) ------------------------------------
  // GET  /skills/:id/context-docs  → { paths: string[] } (ordered)
  // PUT  /skills/:id/context-docs  → { paths: string[] } (full-replace + reorder)

  app.get(
    '/skills/:id/context-docs',
    {
      schema: {
        params: IdParams,
        response: { 200: SkillContextDocsResponse },
      },
    },
    async (req): Promise<SkillContextDocsResponse> => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.getContextDocs(workspaceId, req.params.id);
      if (!result) throw new NotFoundError('Skill not found');
      return result;
    },
  );

  app.put(
    '/skills/:id/context-docs',
    {
      schema: {
        params: IdParams,
        body: SkillContextDocsSetRequest,
        response: { 200: SkillContextDocsResponse },
      },
    },
    async (req): Promise<SkillContextDocsResponse> => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.setContextDocs(workspaceId, req.params.id, req.body.paths);
      if (!result) throw new NotFoundError('Skill not found');
      return result;
    },
  );
}
