/**
 * Why + Risk Brief, end-to-end over Postgres: seed a workspace + repo + PR with a
 * derived intent (so the input isn't fully-empty), then drive the real route with a
 * MockLLMProvider and assert the feature's whole contract:
 *   - fresh compose = source 'fresh' + EXACTLY ONE structured call (AC-6/18)
 *   - reopen        = source 'cache' + ZERO new calls (AC-11/12)
 *   - regenerate    = ONE more call, replacing the cache (AC-13)
 *   - new head sha  = served 'outdated' with NO new call (AC-14b)
 *   - fully-empty PR = empty brief, ZERO calls (AC-3b)
 *   - unknown PR    = 404
 * The in-flight lock (AC-13b) and grounding survivor-ref (AC-10) are covered by the
 * pure unit tests (assemble/ground) — this suite proves the integration wiring.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Brief } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../../adapters/mocks.js';
import { ReviewRepository } from '../reviews/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const BRIEF_FIXTURE: Brief = {
  what: 'Adds token-bucket rate limiting to public endpoints.',
  why: 'Prevent abuse from unauthenticated clients.',
  risk_level: 'medium',
  risks: [
    { title: 'Auth surface touched', explanation: 'limiter wraps public routes', severity: 'high', file_refs: ['src/mw.ts'] },
  ],
  review_focus: [{ file: 'src/mw.ts', line: 5, reason: 'core limiter logic' }],
};

function countStructured(llm: MockLLMProvider): number {
  return llm.calls.filter((c) => c.method === 'completeStructured').length;
}

d('POST /pulls/:id/brief — Why + Risk Brief end-to-end', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let llm: MockLLMProvider;
  let prId: string;
  let emptyPrId: string;
  let db: PgFixture['handle']['db'];

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId } = await seed(pg.handle.db);
    db = pg.handle.db;

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'web', fullName: 'acme/web' })
      .returning();
    const repoId = repo!.id;

    // PR #1 — has a derived intent → NOT fully-empty → fresh path spends one call.
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 1,
        title: 'add rate limit',
        author: 'octocat',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'sha1',
      })
      .returning();
    prId = pr!.id;
    await new ReviewRepository(db).upsertIntent(prId, {
      intent: 'Add rate limiting to public API endpoints.',
      in_scope: ['middleware for rate limiting'],
      out_of_scope: ['authentication changes'],
    });

    // PR #2 — no intent, no blast index, no issue → fully-empty → zero calls.
    const [emptyPr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 2,
        title: 'empty pr',
        author: 'grace',
        branch: 'feat/empty',
        base: 'main',
        headSha: 'sha2',
      })
      .returning();
    emptyPrId = emptyPr!.id;

    llm = new MockLLMProvider('openai', { structured: BRIEF_FIXTURE });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: llm },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('fresh compose: source=fresh, materialized, exactly one LLM call (AC-6/18)', async () => {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: {} });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toBe('fresh');
    expect(body.materialized).toBe(true);
    expect(body.what).toBe(BRIEF_FIXTURE.what);
    expect(typeof body.input_tokens).toBe('number');
    expect(countStructured(llm)).toBe(1);
  });

  it('reopen serves from cache with ZERO new LLM calls (AC-11/12)', async () => {
    const before = countStructured(llm);
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().source).toBe('cache');
    expect(countStructured(llm)).toBe(before); // no new call
  });

  it('regenerate forces exactly one fresh call, replacing the cache (AC-13)', async () => {
    const before = countStructured(llm);
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/brief`,
      payload: { regenerate: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().source).toBe('fresh');
    expect(countStructured(llm)).toBe(before + 1);
  });

  it('a new PR head sha marks the cached brief outdated with NO new call (AC-14b)', async () => {
    const before = countStructured(llm);
    await db.update(t.pullRequests).set({ headSha: 'sha1-new' }).where(eq(t.pullRequests.id, prId));
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().outdated).toBe(true);
    expect(countStructured(llm)).toBe(before); // served from cache, no call
  });

  it('a fully-empty PR returns an empty brief with ZERO calls (AC-3b)', async () => {
    const before = countStructured(llm);
    const res = await app.inject({ method: 'POST', url: `/pulls/${emptyPrId}/brief`, payload: {} });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.materialized).toBe(false);
    expect(body.risks).toHaveLength(0);
    expect(body.review_focus).toHaveLength(0);
    expect(countStructured(llm)).toBe(before); // no call for an empty PR
  });

  it('404s for an unknown PR id', async () => {
    const res = await app.inject({ method: 'POST', url: `/pulls/${randomUUID()}/brief`, payload: {} });
    expect(res.statusCode).toBe(404);
  });
});
