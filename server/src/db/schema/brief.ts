import { pgTable, uuid, text, integer, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import type { Brief } from '@devdigest/shared';

// ============================================================ Why + Risk Brief cache

/**
 * Per-PR brief cache. Cache key = (workspace_id, pr_id) — AC-14.
 *
 * A single cached brief exists per PR; it is invalidated by an explicit
 * regenerate (AC-13) via `invalidate(workspaceId, prId)`, NOT auto-invalidated
 * when the PR head changes (D6 / AC-14b). The stored `built_head_sha` lets the
 * service detect staleness and mark the response `outdated` (AC-14b).
 *
 * `source` distinguishes a fresh LLM call from a cache hit (AC-18).
 * `input_tokens` records the assembled-input token count so ≤8K is verifiable (AC-17).
 */
export const prBriefCache = pgTable(
  'pr_brief_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    /** The LLM-composed Brief JSON (AC-1..AC-9). Typed for TypeScript; stored as jsonb. */
    brief: jsonb('brief').$type<Brief>().notNull(),
    /** The PR head sha the brief was built against (AC-14b outdated detection). */
    builtHeadSha: text('built_head_sha').notNull(),
    /**
     * The blast index `ref` sha for caller-file anchors (AC-10). Persisted so a
     * cache-hit response keeps the indexed-commit anchor instead of falling back
     * to the PR head. Null when no surviving item maps to a caller file.
     */
    ref: text('ref'),
    /** Assembled-input token count so the ≤8K budget is verifiable after the fact (AC-17). */
    inputTokens: integer('input_tokens'),
    /**
     * Cache hit vs fresh call marker (AC-18).
     * 'fresh' = produced by an LLM call; 'cache' = served from this table.
     * The value stored here is always 'fresh' (the service writes 'fresh' on upsert;
     * the repository layer returns 'cache' when serving from the stored row).
     */
    source: text('source', { enum: ['fresh', 'cache'] }).notNull().default('fresh'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // The per-PR uniqueness constraint (AC-14): only one cached brief per workspace+PR.
    uq: uniqueIndex('pr_brief_cache_ws_pr_uq').on(t.workspaceId, t.prId),
  }),
);
