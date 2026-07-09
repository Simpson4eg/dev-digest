import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { RepoIntelRepository } from '../modules/repo-intel/repository.js';

/**
 * Demo-only seed for the Blast Radius UI. The base `seed()` inserts the
 * `acme/payments-api` repo + PR #482 but NOT a repo-intel index (clonePath is
 * null → no clone → no indexer). Without an index the Blast panel correctly
 * shows its empty state. This script fills the persistent index for PR #482 so
 * the panel renders the rich map from the design mock (rateLimit()/bucketKey()
 * → callers file:line → impacted endpoints + a cron), fully offline and
 * deterministic — no GitHub token, no clone, still ZERO LLM.
 *
 * Idempotent: re-running clears and rewrites the index rows for the repo.
 * Run AFTER `pnpm db:seed`:  pnpm exec tsx src/db/seed-blast-demo.ts
 */

const REPO_FULL_NAME = 'acme/payments-api';

/** The changed shared helper the PR touches (must be one of PR #482's pr_files). */
const DECL_FILE = 'src/middleware/ratelimit.ts';

export async function seedBlastDemo(db: Db): Promise<{ repoId: string; callers: number }> {
  const [repo] = await db
    .select({ id: t.repos.id })
    .from(t.repos)
    .where(eq(t.repos.fullName, REPO_FULL_NAME));
  if (!repo) {
    throw new Error(
      `Repo "${REPO_FULL_NAME}" not found — run \`pnpm db:seed\` first, then re-run this script.`,
    );
  }
  const repoId = repo.id;
  const repoIntel = new RepoIntelRepository(db);

  // Idempotency: wipe any prior index rows for this repo (file_rank/file_facts
  // are replaced by their helpers; symbols/references we clear explicitly).
  await db.delete(t.references).where(eq(t.references.repoId, repoId));
  await db.delete(t.symbols).where(eq(t.symbols.repoId, repoId));

  // status:'full' → getBlastRadius serves the persistent (non-degraded) path.
  await repoIntel.upsertIndexState({
    repoId,
    lastIndexedSha: 'a1b2c3d4e5f6', // matches PR #482 head_sha
    indexerVersion: 1,
    status: 'full',
    filesIndexed: 9,
    filesSkipped: 0,
    stats: { demo: true },
  });

  // The two changed symbols, declared in the changed shared helper.
  await repoIntel.insertSymbols([
    {
      repoId,
      path: DECL_FILE,
      name: 'rateLimit',
      kind: 'function',
      line: 12,
      endLine: 48,
      exported: true,
      signature: 'export function rateLimit(opts: LimitOpts): Middleware',
      contentHash: 'demo',
    },
    {
      repoId,
      path: DECL_FILE,
      name: 'bucketKey',
      kind: 'function',
      line: 50,
      endLine: 61,
      exported: true,
      signature: 'function bucketKey(req: Request): string',
      contentHash: 'demo',
    },
  ]);

  // Caller files must be ranked (getResolvedCallers inner-joins file_rank).
  await repoIntel.replaceFileRank(repoId, [
    { filePath: 'src/api/public/index.ts', pagerank: 0.95, hotness: 0, rank: 95, percentile: 98 },
    { filePath: 'src/server.ts', pagerank: 0.9, hotness: 0, rank: 90, percentile: 96 },
    { filePath: 'src/api/public/webhooks.ts', pagerank: 0.8, hotness: 0, rank: 80, percentile: 90 },
    { filePath: 'src/api/public/health.ts', pagerank: 0.6, hotness: 0, rank: 60, percentile: 75 },
    { filePath: 'src/worker/reset.ts', pagerank: 0.4, hotness: 0, rank: 40, percentile: 55 },
  ]);

  // Precomputed endpoints/crons per caller file — the impact the panel shows.
  await repoIntel.replaceFileFacts(repoId, [
    { filePath: 'src/api/public/index.ts', endpoints: ['GET /api/public/items'], crons: [] },
    { filePath: 'src/api/public/webhooks.ts', endpoints: ['POST /api/public/webhooks'], crons: [] },
    { filePath: 'src/api/public/health.ts', endpoints: ['GET /api/public/health'], crons: [] },
    { filePath: 'src/worker/reset.ts', endpoints: [], crons: ['reset-rate-buckets'] },
  ]);

  // Resolved references: caller file → changed symbol, decl_file = the changed
  // helper. insertReferences doesn't set decl_file, so insert directly.
  const refs = [
    { fromPath: 'src/api/public/index.ts', toSymbol: 'rateLimit', line: 23 },
    { fromPath: 'src/api/public/webhooks.ts', toSymbol: 'rateLimit', line: 45 },
    { fromPath: 'src/api/public/health.ts', toSymbol: 'rateLimit', line: 11 },
    { fromPath: 'src/server.ts', toSymbol: 'rateLimit', line: 88 },
    { fromPath: 'src/api/public/index.ts', toSymbol: 'bucketKey', line: 40 },
    { fromPath: 'src/worker/reset.ts', toSymbol: 'bucketKey', line: 12 },
  ];
  await db.insert(t.references).values(
    refs.map((r) => ({
      repoId,
      fromPath: r.fromPath,
      toSymbol: r.toSymbol,
      line: r.line,
      declFile: DECL_FILE,
      contentHash: 'demo',
    })),
  );

  return { repoId, callers: refs.length };
}

// CLI entrypoint (mirrors seed.ts; argv normalized for Windows).
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seedBlastDemo(handle.db)
    .then(async (r) => {
      console.log('✓ blast demo index seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ blast demo seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
