import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-docs] Docker not available — skipping integration tests.');
}

/**
 * Task 2 — attachment persistence round-trip tests.
 *
 * Covers: attach → read-back (ordered), reorder persists new order, detach
 * removes path, cross-workspace isolation (tenant safety), and both the
 * agent side (agent_context_docs) and skill side (skill_context_docs).
 */
d('context-docs attachment persistence (agent + skill)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  // ---- Agent side -----------------------------------------------------------

  it('agent: attach paths → read-back in stored order', async () => {
    const { db } = pg.handle;
    const repo = new AgentsRepository(db);

    const [agentRow] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'ctx-test-agent-1',
        description: '',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'Test.',
      })
      .returning();

    const agentId = agentRow!.id;
    const paths = ['specs/SPEC-01.md', 'docs/adr-001.md', 'insights/2026-01-01.md'];
    await repo.setContextDocs(agentId, paths);

    const linked = await repo.linkedContextDocs(workspaceId, agentId);
    expect(linked.map((r) => r.path)).toEqual(paths);
    expect(linked.map((r) => r.order)).toEqual([0, 1, 2]);
  });

  it('agent: reorder persists new order (AC-6)', async () => {
    const { db } = pg.handle;
    const repo = new AgentsRepository(db);

    const [agentRow] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'ctx-test-agent-2',
        description: '',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'Test.',
      })
      .returning();

    const agentId = agentRow!.id;

    // Attach in original order
    await repo.setContextDocs(agentId, ['docs/a.md', 'docs/b.md', 'docs/c.md']);

    // Reorder: c first, then a, then b
    await repo.setContextDocs(agentId, ['docs/c.md', 'docs/a.md', 'docs/b.md']);

    const linked = await repo.linkedContextDocs(workspaceId, agentId);
    expect(linked.map((r) => r.path)).toEqual(['docs/c.md', 'docs/a.md', 'docs/b.md']);
    expect(linked.map((r) => r.order)).toEqual([0, 1, 2]);
  });

  it('agent: detach removes path; subsequent read excludes it (AC-7)', async () => {
    const { db } = pg.handle;
    const repo = new AgentsRepository(db);

    const [agentRow] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'ctx-test-agent-3',
        description: '',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'Test.',
      })
      .returning();

    const agentId = agentRow!.id;
    await repo.setContextDocs(agentId, ['specs/A.md', 'specs/B.md']);

    // Detach specs/A.md by setting only specs/B.md
    await repo.setContextDocs(agentId, ['specs/B.md']);

    const linked = await repo.linkedContextDocs(workspaceId, agentId);
    expect(linked.map((r) => r.path)).toEqual(['specs/B.md']);
    expect(linked).toHaveLength(1);
  });

  it('agent: empty set → no rows returned (AC-12 ground truth)', async () => {
    const { db } = pg.handle;
    const repo = new AgentsRepository(db);

    const [agentRow] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'ctx-test-agent-4',
        description: '',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'Test.',
      })
      .returning();

    const agentId = agentRow!.id;
    await repo.setContextDocs(agentId, []);

    const linked = await repo.linkedContextDocs(workspaceId, agentId);
    expect(linked).toHaveLength(0);
  });

  it('agent: cross-workspace isolation — foreign agent returns empty (tenant safety)', async () => {
    const { db } = pg.handle;
    const repo = new AgentsRepository(db);

    // Create a second workspace + an agent in it
    const [foreignWs] = await db
      .insert(t.workspaces)
      .values({ name: 'ctx-docs-foreign-ws-agent' })
      .returning();

    const [foreignAgent] = await db
      .insert(t.agents)
      .values({
        workspaceId: foreignWs!.id,
        name: 'foreign-agent',
        description: '',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'Foreign.',
      })
      .returning();

    // Attach docs to the foreign agent (bypass repo — write directly)
    await db.insert(t.agentContextDocs).values([
      { agentId: foreignAgent!.id, path: 'docs/secret.md', order: 0 },
    ]);

    // Reading from our workspace must see nothing for the foreign agent's id
    const linked = await repo.linkedContextDocs(workspaceId, foreignAgent!.id);
    expect(linked).toHaveLength(0);
  });

  // ---- Skill side -----------------------------------------------------------

  it('skill: attach paths → read-back in stored order (AC-5)', async () => {
    const { db } = pg.handle;
    const repo = new SkillsRepository(db);

    const [skillRow] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'ctx-test-skill-1',
        description: 'Test skill.',
        type: 'rubric',
        source: 'manual',
        body: '# Test',
      })
      .returning();

    const skillId = skillRow!.id;
    const paths = ['specs/SPEC-01.md', 'docs/guide.md'];
    await repo.setContextDocs(skillId, paths);

    const linked = await repo.linkedContextDocs(workspaceId, skillId);
    expect(linked.map((r) => r.path)).toEqual(paths);
    expect(linked.map((r) => r.order)).toEqual([0, 1]);
  });

  it('skill: reorder persists new order', async () => {
    const { db } = pg.handle;
    const repo = new SkillsRepository(db);

    const [skillRow] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'ctx-test-skill-2',
        description: 'Test skill.',
        type: 'rubric',
        source: 'manual',
        body: '# Test',
      })
      .returning();

    const skillId = skillRow!.id;
    await repo.setContextDocs(skillId, ['docs/x.md', 'docs/y.md']);
    await repo.setContextDocs(skillId, ['docs/y.md', 'docs/x.md']);

    const linked = await repo.linkedContextDocs(workspaceId, skillId);
    expect(linked.map((r) => r.path)).toEqual(['docs/y.md', 'docs/x.md']);
  });

  it('skill: detach removes path (AC-7)', async () => {
    const { db } = pg.handle;
    const repo = new SkillsRepository(db);

    const [skillRow] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'ctx-test-skill-3',
        description: 'Test skill.',
        type: 'rubric',
        source: 'manual',
        body: '# Test',
      })
      .returning();

    const skillId = skillRow!.id;
    await repo.setContextDocs(skillId, ['specs/A.md', 'specs/B.md']);
    await repo.setContextDocs(skillId, ['specs/B.md']);

    const linked = await repo.linkedContextDocs(workspaceId, skillId);
    expect(linked.map((r) => r.path)).toEqual(['specs/B.md']);
  });

  it('skill: cross-workspace isolation — foreign skill returns empty (tenant safety)', async () => {
    const { db } = pg.handle;
    const repo = new SkillsRepository(db);

    const [foreignWs] = await db
      .insert(t.workspaces)
      .values({ name: 'ctx-docs-foreign-ws-skill' })
      .returning();

    const [foreignSkill] = await db
      .insert(t.skills)
      .values({
        workspaceId: foreignWs!.id,
        name: 'foreign-skill',
        description: 'Foreign.',
        type: 'rubric',
        source: 'manual',
        body: '# Foreign',
      })
      .returning();

    // Directly insert a context doc for the foreign skill
    await db.insert(t.skillContextDocs).values([
      { skillId: foreignSkill!.id, path: 'docs/secret.md', order: 0 },
    ]);

    // Our workspace must see nothing for the foreign skill
    const linked = await repo.linkedContextDocs(workspaceId, foreignSkill!.id);
    expect(linked).toHaveLength(0);
  });
});
