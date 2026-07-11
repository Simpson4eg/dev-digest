import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Brief, BriefSource } from '@devdigest/shared';

/**
 * BriefCacheRow — the shape returned by getByPull.
 *
 * Fields from the DB row plus the `source: 'cache'` marker added here
 * (the stored value is always 'fresh'; the repo layer rewrites it to 'cache'
 * so the caller can distinguish a served cache row from a freshly-composed one
 * without inspecting raw columns — AC-18).
 */
export interface BriefCacheRow {
  id: string;
  workspaceId: string;
  prId: string;
  brief: Brief;
  builtHeadSha: string;
  /** Blast index ref sha for caller-file anchors (AC-10); null when none. */
  ref: string | null;
  inputTokens: number | null;
  /** Always 'cache' when returned from getByPull — AC-18. */
  source: BriefSource;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Per-PR brief cache repository.
 *
 * Every read is scoped by both `workspace_id` and `pr_id` — tenant safety
 * (server INSIGHTS 2026-06-29). The cache key is (workspace_id, pr_id),
 * enforced by the unique index `pr_brief_cache_ws_pr_uq` (AC-14).
 *
 * The table name is `pr_brief_cache`; the Drizzle schema reference is
 * `t.prBriefCache` (schema.ts barrel).
 */
export class BriefRepository {
  constructor(private db: Db) {}

  /**
   * Retrieve the cached brief for a PR. Returns undefined on cache miss.
   *
   * Filters by `workspace_id` first so a brief stored under workspace A is
   * never returned for workspace B even when they share a PR id (AC-14).
   * The returned `source` is forced to 'cache' — AC-18.
   */
  async getByPull(workspaceId: string, prId: string): Promise<BriefCacheRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.prBriefCache)
      .where(and(eq(t.prBriefCache.workspaceId, workspaceId), eq(t.prBriefCache.prId, prId)));

    if (!row) return undefined;

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      prId: row.prId,
      brief: row.brief,
      builtHeadSha: row.builtHeadSha,
      ref: row.ref ?? null,
      inputTokens: row.inputTokens ?? null,
      // The row stores 'fresh' (the value at write time). When serving from the
      // cache, we override to 'cache' so AC-18 is accurate without an extra column.
      source: 'cache' as BriefSource,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Insert or replace the cached brief for a PR.
   *
   * The unique constraint on (workspace_id, pr_id) means a second upsert for
   * the same PR replaces the row. This is the only write path — invalidate()
   * deletes the row so the next upsert always creates fresh.
   */
  async upsert(
    workspaceId: string,
    prId: string,
    brief: Brief,
    builtHeadSha: string,
    inputTokens: number | null,
    source: BriefSource,
    ref: string | null = null,
  ): Promise<void> {
    const now = new Date();
    await this.db
      .insert(t.prBriefCache)
      .values({
        workspaceId,
        prId,
        brief,
        builtHeadSha,
        ref: ref ?? null,
        inputTokens: inputTokens ?? null,
        // Source stored as-written; getByPull rewrites to 'cache' on serve.
        source,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        // The unique index on (workspace_id, pr_id) is the conflict target.
        target: [t.prBriefCache.workspaceId, t.prBriefCache.prId],
        set: {
          brief,
          builtHeadSha,
          ref: ref ?? null,
          inputTokens: inputTokens ?? null,
          source,
          updatedAt: now,
        },
      });
  }

  /**
   * Invalidate (delete) the cached brief for a PR so the next request goes
   * through the fresh compose path.
   *
   * Scoped by workspace_id for tenant safety — AC-14 / INSIGHTS 2026-06-29.
   */
  async invalidate(workspaceId: string, prId: string): Promise<void> {
    await this.db
      .delete(t.prBriefCache)
      .where(and(eq(t.prBriefCache.workspaceId, workspaceId), eq(t.prBriefCache.prId, prId)));
  }
}
