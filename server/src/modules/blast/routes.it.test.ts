/**
 * Blast Radius, end-to-end over Postgres: seed the persistent repo-intel index
 * (index state = full, one changed symbol, a cross-file caller resolved to the
 * changed file, that caller's file_rank + file_facts), then hit the real route
 * and assert the shaped, NON-degraded contract. Exercises the full path:
 * getContext → BlastService (getPull + getPrFiles) → repoIntel.getBlastRadius
 * (persistent queries) → shapeBlastRadius. No LLM, no clone on disk.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { MockGitClient, MockGitHubClient } from '../../adapters/mocks.js';
import { RepoIntelRepository } from '../repo-intel/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('GET /pulls/:id/blast — blast radius from the persistent index', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId } = await seed(pg.handle.db);
    const db = pg.handle.db;

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'web', fullName: 'acme/web' })
      .returning();
    const repoId = repo!.id;

    const repoIntel = new RepoIntelRepository(db);
    // status:'full' → getBlastRadius takes the persistent (non-degraded) path.
    await repoIntel.upsertIndexState({
      repoId,
      lastIndexedSha: 'sha1',
      indexerVersion: 1,
      status: 'full',
      filesIndexed: 3,
      filesSkipped: 0,
      stats: {},
    });
    // The changed symbol, declared in the file the PR touches.
    await repoIntel.insertSymbols([
      {
        repoId,
        path: 'src/mw.ts',
        name: 'rateLimit',
        kind: 'function',
        line: 1,
        endLine: 5,
        exported: true,
        signature: 'rateLimit()',
        contentHash: 'h',
      },
    ]);
    // The caller's file must be ranked (getResolvedCallers inner-joins file_rank).
    await repoIntel.replaceFileRank(repoId, [
      { filePath: 'src/api/public/index.ts', pagerank: 0.9, hotness: 0, rank: 90, percentile: 95 },
    ]);
    // …and carry the endpoint the caller exposes.
    await repoIntel.replaceFileFacts(repoId, [
      { filePath: 'src/api/public/index.ts', endpoints: ['GET /api/public/items'], crons: [] },
    ]);
    // A resolved reference: caller file → changed symbol, decl_file = the changed
    // file (insertReferences doesn't set decl_file, so insert it directly).
    await db.insert(t.references).values({
      repoId,
      fromPath: 'src/api/public/index.ts',
      toSymbol: 'rateLimit',
      line: 23,
      declFile: 'src/mw.ts',
      contentHash: 'h',
    });

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
    await db.insert(t.prFiles).values({ prId, path: 'src/mw.ts', additions: 10, deletions: 0 });

    // An EARLIER merged PR that also touched src/mw.ts → expected in `prior_prs`.
    const [priorPr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 0,
        title: 'earlier mw change',
        author: 'ada',
        branch: 'chore/mw',
        base: 'main',
        headSha: 'sha0',
        status: 'merged',
        mergedAt: new Date('2026-01-02T00:00:00Z'),
      })
      .returning();
    await db
      .insert(t.prFiles)
      .values({ prId: priorPr!.id, path: 'src/mw.ts', additions: 3, deletions: 1 });
    // An OPEN PR over the same file must NOT appear (merged_at IS NULL).
    const [openPr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 2,
        title: 'open mw change',
        author: 'grace',
        branch: 'feat/mw2',
        base: 'main',
        headSha: 'sha2',
      })
      .returning();
    await db
      .insert(t.prFiles)
      .values({ prId: openPr!.id, path: 'src/mw.ts', additions: 1, deletions: 0 });

    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('groups the caller under the changed symbol + surfaces the endpoint (not degraded)', async () => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.degraded).toBeFalsy();
    expect(body.summary).toBe('');
    // Caller links anchor to the indexed commit, not the PR head.
    expect(body.ref).toBe('sha1');
    expect(body.changed_symbols.map((s: { name: string }) => s.name)).toContain('rateLimit');

    const rate = body.downstream.find((dd: { symbol: string }) => dd.symbol === 'rateLimit');
    expect(rate).toBeTruthy();
    expect(
      rate.callers.some(
        (c: { file: string; line: number }) => c.file === 'src/api/public/index.ts' && c.line === 23,
      ),
    ).toBe(true);
    expect(rate.endpoints_affected).toContain('GET /api/public/items');

    // prior_prs: only the earlier MERGED overlapping PR, with its file overlap.
    expect(body.prior_prs).toHaveLength(1);
    expect(body.prior_prs[0]).toMatchObject({
      pr_number: 0,
      author: 'ada',
      files_overlap: ['src/mw.ts'],
    });
  });

  it('404s for an unknown PR id', async () => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/blast` });
    expect(res.statusCode).toBe(404);
  });
});
