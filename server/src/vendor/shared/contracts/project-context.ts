import { z } from 'zod';

/**
 * Project Context contracts — reader discovery + attach/detach payloads.
 *
 * These contracts are schema-first (fastify-type-provider-zod): the Zod schemas
 * here drive both request validation and response serialization. Do NOT
 * hand-roll Schema.parse() in route handlers.
 *
 * All repo-relative paths in this contract are forward-slash strings relative
 * to the repo root, e.g. "specs/SPEC-01.md". They are validated/contained at
 * the adapter layer (SimpleGitClient.readFile), not here.
 */

// ---------------------------------------------------------------------------
// Reader / discovery (Task 3 route)
// ---------------------------------------------------------------------------

/** A single discoverable context document, identified by its repo-relative path. */
export const ContextDoc = z.object({
  /** Repo-relative path, e.g. "specs/SPEC-01.md". Forward-slash separated. */
  path: z.string().min(1),
});
export type ContextDoc = z.infer<typeof ContextDoc>;

/** Response body of GET /repos/:id/context-docs */
export const ContextDocListResponse = z.object({
  docs: z.array(ContextDoc),
});
export type ContextDocListResponse = z.infer<typeof ContextDocListResponse>;

// ---------------------------------------------------------------------------
// Agent attach / detach / reorder (Task 5 routes)
// ---------------------------------------------------------------------------

/**
 * Request body for PUT /agents/:agentId/context-docs — replaces the agent's
 * full ordered attachment list in one shot (mirrors the setSkills pattern).
 * Paths must be repo-relative, non-empty strings; order = array order.
 */
export const AgentContextDocsSetRequest = z.object({
  paths: z.array(z.string().min(1)),
});
export type AgentContextDocsSetRequest = z.infer<typeof AgentContextDocsSetRequest>;

/** Response body of GET /agents/:agentId/context-docs */
export const AgentContextDocsResponse = z.object({
  paths: z.array(z.string()),
});
export type AgentContextDocsResponse = z.infer<typeof AgentContextDocsResponse>;

// ---------------------------------------------------------------------------
// Skill attach / detach (Task 5 routes)
// ---------------------------------------------------------------------------

/**
 * Request body for PUT /skills/:skillId/context-docs — replaces the skill's
 * full attachment list in one shot (order = array order).
 */
export const SkillContextDocsSetRequest = z.object({
  paths: z.array(z.string().min(1)),
});
export type SkillContextDocsSetRequest = z.infer<typeof SkillContextDocsSetRequest>;

/** Response body of GET /skills/:skillId/context-docs */
export const SkillContextDocsResponse = z.object({
  paths: z.array(z.string()),
});
export type SkillContextDocsResponse = z.infer<typeof SkillContextDocsResponse>;
