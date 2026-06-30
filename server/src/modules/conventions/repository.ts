import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from './helpers.js';

interface InsertConvention {
  workspaceId: string;
  repoId: string;
  rule: string;
  category?: string | null;
  evidencePath?: string | null;
  evidenceLine?: number | null;
  evidenceSnippet?: string | null;
  confidence?: number | null;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(asc(t.conventions.createdAt)) as Promise<ConventionRow[]>;
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row as ConventionRow | undefined;
  }

  async getByIds(workspaceId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)),
      ) as Promise<ConventionRow[]>;
  }

  async insertMany(values: InsertConvention[]): Promise<ConventionRow[]> {
    if (values.length === 0) return [];
    const rows = await this.db
      .insert(t.conventions)
      .values(
        values.map((v) => ({
          workspaceId: v.workspaceId,
          repoId: v.repoId,
          rule: v.rule,
          category: v.category ?? null,
          evidencePath: v.evidencePath ?? null,
          evidenceLine: v.evidenceLine ?? null,
          evidenceSnippet: v.evidenceSnippet ?? null,
          confidence: v.confidence ?? null,
          status: 'candidate' as const,
          accepted: false,
        })),
      )
      .returning();
    return rows as ConventionRow[];
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { status?: 'candidate' | 'accepted' | 'rejected'; rule?: string; category?: string },
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined
          ? { status: patch.status, accepted: patch.status === 'accepted' }
          : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row as ConventionRow | undefined;
  }

  async deleteByRepo(workspaceId: string, repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }
}
