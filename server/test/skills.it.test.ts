import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('skills API', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => pg?.stop());

  async function app() {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('creates, edits, versions, lists and deletes a skill', async () => {
    const instance = await app();
    const created = await instance.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'branch-coverage',
        description: 'Detect untested branches.',
        type: 'rubric',
        body: '# Branches\nCheck every branch.',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ version: 1, source: 'manual', enabled: true });
    const id = created.json().id as string;

    const updated = await instance.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# Branches\nCheck branches and boundary values.' },
    });
    expect(updated.json().version).toBe(2);
    const versions = await instance.inject({ method: 'GET', url: `/skills/${id}/versions` });
    expect(versions.json().map((version: { version: number }) => version.version)).toEqual([2, 1]);
    expect((await instance.inject({ method: 'GET', url: '/skills' })).json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id, name: 'branch-coverage' })]),
    );
    expect((await instance.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(200);
    expect((await instance.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    await instance.close();
  });

  it('previews ZIP without persisting and ignores non-Markdown content', async () => {
    const instance = await app();
    const before = (await instance.inject({ method: 'GET', url: '/skills' })).json().length;
    const archive = zipSync({
      'skill/SKILL.md': strToU8('# Safe import\nReview boundary cases.'),
      'skill/install.js': strToU8('throw new Error("must never run")'),
    });
    const preview = await instance.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'skill.zip', content_base64: Buffer.from(archive).toString('base64') },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().ignored_files).toContain('skill/install.js');
    expect((await instance.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);
    await instance.close();
  });

  it('sets ordered agent links and rejects a skill from another workspace', async () => {
    const instance = await app();
    const [agent] = (await instance.inject({ method: 'GET', url: '/agents' })).json();
    const create = (name: string) =>
      instance.inject({
        method: 'POST', url: '/skills',
        payload: { name, description: `Apply ${name}.`, type: 'custom', body: `# ${name}` },
      });
    const first = (await create('first')).json();
    const second = (await create('second')).json();
    const linked = await instance.inject({
      method: 'POST', url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [second.id, first.id] },
    });
    expect(linked.statusCode).toBe(200);
    expect(linked.json().map((link: { skill_id: string }) => link.skill_id)).toEqual([second.id, first.id]);

    const [foreignWorkspace] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign-skills' }).returning();
    const [foreignSkill] = await pg.handle.db.insert(t.skills).values({
      workspaceId: foreignWorkspace!.id,
      name: 'foreign', description: 'Foreign.', type: 'custom', source: 'manual', body: '# Foreign',
    }).returning();
    const rejected = await instance.inject({
      method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [foreignSkill!.id] },
    });
    expect(rejected.statusCode).toBe(422);
    await instance.close();
  });

  it('aggregates 30-day usage and finding stats from skill-aware run traces', async () => {
    const instance = await app();
    const [agent] = (await instance.inject({ method: 'GET', url: '/agents' })).json();
    const skill = (
      await instance.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'stats-skill', description: 'Track this skill.', type: 'custom', body: '# Stats' },
      })
    ).json();
    await instance.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    const [workspace] = await pg.handle.db.select().from(t.workspaces);
    const [pull] = await pg.handle.db.select().from(t.pullRequests);
    const [withSkill, withoutSkill] = await pg.handle.db
      .insert(t.agentRuns)
      .values([
        { workspaceId: workspace!.id, agentId: agent.id, prId: pull!.id, status: 'done' },
        { workspaceId: workspace!.id, agentId: agent.id, prId: pull!.id, status: 'done' },
      ])
      .returning();
    await pg.handle.db.insert(t.runTraces).values([
      { runId: withSkill!.id, trace: { config: { skills: [{ id: skill.id, name: skill.name, version: 1 }] } } },
      { runId: withoutSkill!.id, trace: { config: { skills: [] } } },
    ]);
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId: workspace!.id, prId: pull!.id, agentId: agent.id, runId: withSkill!.id, kind: 'review' })
      .returning();
    const now = new Date();
    await pg.handle.db.insert(t.findings).values([
      { reviewId: review!.id, file: 'a.ts', startLine: 1, endLine: 1, severity: 'WARNING', category: 'security', title: 'A', rationale: 'A', confidence: 0.9, acceptedAt: now },
      { reviewId: review!.id, file: 'b.ts', startLine: 2, endLine: 2, severity: 'WARNING', category: 'security', title: 'B', rationale: 'B', confidence: 0.8, dismissedAt: now },
      { reviewId: review!.id, file: 'c.ts', startLine: 3, endLine: 3, severity: 'SUGGESTION', category: 'bug', title: 'C', rationale: 'C', confidence: 0.7 },
    ]);

    const response = await instance.inject({ method: 'GET', url: `/skills/${skill.id}/stats` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      window_days: 30,
      runs_with_skill: 1,
      traced_runs: 2,
      pull_frequency: 0.5,
      findings: 3,
      accepted: 1,
      dismissed: 1,
      accept_rate: 0.5,
      used_by_agents: [expect.objectContaining({ id: agent.id })],
      findings_by_category: [
        { category: 'security', count: 2 },
        { category: 'bug', count: 1 },
      ],
    });
    await instance.close();
  });
});
