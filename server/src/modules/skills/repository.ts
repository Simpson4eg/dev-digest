import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { SkillSource, SkillStats, SkillType } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  list(workspaceId: string) {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async insert(values: InsertSkill) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled ?? true,
          evidenceFiles: values.evidenceFiles ?? null,
          version: 1,
        })
        .returning();
      await tx.insert(t.skillVersions).values({ skillId: row!.id, version: 1, body: row!.body });
      return row!;
    });
  }

  async update(workspaceId: string, id: string, patch: UpdateSkill) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
      if (!existing) return undefined;

      const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
      const nextVersion = bodyChanged ? existing.version + 1 : existing.version;
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
          ...(bodyChanged ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (bodyChanged) {
        await tx.insert(t.skillVersions).values({
          skillId: id,
          version: nextVersion,
          body: row!.body,
        });
      }
      return row;
    });
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(workspaceId: string, skillId: string) {
    const skill = await this.getById(workspaceId, skillId);
    if (!skill) return undefined;
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async stats(workspaceId: string, skillId: string, windowDays = 30): Promise<SkillStats> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const [agents, traceRows] = await Promise.all([
      this.db
        .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
        .from(t.agentSkills)
        .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
        .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)))
        .orderBy(asc(t.agents.name)),
      this.db
        .select({
          runId: t.agentRuns.id,
          skills: sql<unknown>`${t.runTraces.trace} #> '{config,skills}'`,
        })
        .from(t.agentRuns)
        .innerJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
        .where(
          and(
            eq(t.agentRuns.workspaceId, workspaceId),
            eq(t.agentRuns.status, 'done'),
            gte(t.agentRuns.ranAt, since),
          ),
        ),
    ]);

    const skillRunIds: string[] = [];
    let tracedRuns = 0;
    for (const row of traceRows) {
      if (!Array.isArray(row.skills)) continue;
      tracedRuns += 1;
      const applied = row.skills.some(
        (skill) => typeof skill === 'object' && skill !== null && 'id' in skill && skill.id === skillId,
      );
      if (applied) skillRunIds.push(row.runId);
    }

    const findingRows =
      skillRunIds.length === 0
        ? []
        : await this.db
            .select({
              category: t.findings.category,
              acceptedAt: t.findings.acceptedAt,
              dismissedAt: t.findings.dismissedAt,
            })
            .from(t.findings)
            .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
            .where(
              and(
                eq(t.reviews.workspaceId, workspaceId),
                inArray(t.reviews.runId, skillRunIds),
              ),
            );

    let accepted = 0;
    let dismissed = 0;
    const categories = new Map<string, number>();
    for (const finding of findingRows) {
      if (finding.acceptedAt) accepted += 1;
      if (finding.dismissedAt) dismissed += 1;
      categories.set(finding.category, (categories.get(finding.category) ?? 0) + 1);
    }
    const decided = accepted + dismissed;

    return {
      window_days: windowDays,
      used_by_agents: agents,
      runs_with_skill: skillRunIds.length,
      traced_runs: tracedRuns,
      pull_frequency: tracedRuns > 0 ? skillRunIds.length / tracedRuns : null,
      findings: findingRows.length,
      accepted,
      dismissed,
      accept_rate: decided > 0 ? accepted / decided : null,
      findings_by_category: [...categories.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    };
  }
}
