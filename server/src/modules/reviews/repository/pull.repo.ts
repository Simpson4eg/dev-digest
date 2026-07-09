import { and, eq, ne, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/** One earlier merged PR that overlaps the current PR's changed files. */
export interface PriorPrRow {
  number: number;
  title: string;
  author: string;
  mergedAt: Date;
  filesOverlap: string[];
}

/**
 * Earlier MERGED PRs in the same repo that touched at least one of
 * `changedFiles` — the "who last touched this code" context for Blast Radius.
 * Excludes the PR under review. Newest merge first; capped at `limit`.
 *
 * Zero-LLM: a single join of `pull_requests` × `pr_files` on the overlapping
 * paths, grouped in memory so each row carries its own `filesOverlap`.
 */
export async function getPriorPrs(
  db: Db,
  repoId: string,
  prId: string,
  changedFiles: string[],
  limit = 10,
): Promise<PriorPrRow[]> {
  if (changedFiles.length === 0) return [];

  const rows = await db
    .select({
      number: t.pullRequests.number,
      title: t.pullRequests.title,
      author: t.pullRequests.author,
      mergedAt: t.pullRequests.mergedAt,
      path: t.prFiles.path,
    })
    .from(t.pullRequests)
    .innerJoin(t.prFiles, eq(t.prFiles.prId, t.pullRequests.id))
    .where(
      and(
        eq(t.pullRequests.repoId, repoId),
        ne(t.pullRequests.id, prId),
        isNotNull(t.pullRequests.mergedAt),
        inArray(t.prFiles.path, changedFiles),
      ),
    );

  // Group the (pr × file) rows back into one entry per PR, collecting overlaps.
  const byPr = new Map<number, PriorPrRow>();
  for (const r of rows) {
    if (!r.mergedAt) continue; // isNotNull guards this; the type is still nullable
    let entry = byPr.get(r.number);
    if (!entry) {
      entry = { number: r.number, title: r.title, author: r.author, mergedAt: r.mergedAt, filesOverlap: [] };
      byPr.set(r.number, entry);
    }
    if (!entry.filesOverlap.includes(r.path)) entry.filesOverlap.push(r.path);
  }

  return [...byPr.values()]
    .sort((a, b) => b.mergedAt.getTime() - a.mergedAt.getTime())
    .slice(0, limit);
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(db: Db, prId: string, intent: Intent): Promise<void> {
  await db
    .insert(t.prIntent)
    .values({
      prId,
      intent: intent.intent,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
    })
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: { intent: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope },
    });
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
}
