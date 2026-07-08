/**
 * DepCruiseGraph.buildEdges — the not-a-workspace-monorepo resolution.
 *
 * Regression for the empty-graph bug: with a per-package tsconfig (path alias)
 * and NO root tsconfig, cruising the whole repo from root with a single root
 * tsconfig resolves zero alias imports → empty graph → blast has no callers.
 * The adapter must group files by their nearest tsconfig and cruise each group
 * with it, so `@/…` alias imports and relative imports both yield edges.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DepCruiseGraph } from './index.js';

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, contents);
}

describe('DepCruiseGraph.buildEdges — per-package tsconfig resolution', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'depgraph-'));
    // A package with its OWN tsconfig defining an `@/*` alias — and NO root
    // tsconfig, mirroring the DevDigest monorepo layout.
    await writeFileAt(
      root,
      'app/tsconfig.json',
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
    );
    await writeFileAt(root, 'app/src/b.ts', 'export const b = 1;\n');
    // alias import (@/b) — unresolvable without app/tsconfig.
    await writeFileAt(root, 'app/src/a.ts', "import { b } from '@/b';\nexport const a = b + 1;\n");
    // relative import (./b) — the no-regression control.
    await writeFileAt(root, 'app/src/c.ts', "import { b } from './b';\nexport const c = b + 2;\n");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves an @/* alias import into an edge (from → to)', async () => {
    const files = ['app/src/a.ts', 'app/src/b.ts', 'app/src/c.ts'];
    const edges = await new DepCruiseGraph().buildEdges(root, files);
    expect(edges).toContainEqual({ from: 'app/src/a.ts', to: 'app/src/b.ts' });
  });

  it('still resolves plain relative imports (no regression)', async () => {
    const files = ['app/src/a.ts', 'app/src/b.ts', 'app/src/c.ts'];
    const edges = await new DepCruiseGraph().buildEdges(root, files);
    expect(edges).toContainEqual({ from: 'app/src/c.ts', to: 'app/src/b.ts' });
  });

  it('returns [] for an empty file list', async () => {
    expect(await new DepCruiseGraph().buildEdges(root, [])).toEqual([]);
  });
});
