import { describe, it, expect } from 'vitest';
import { classify } from './classify.js';
import { composeSmartDiff, type FileInput, type FindingInput } from './compose.js';
import { SPLIT_TOO_BIG_LINES } from './constants.js';

describe('classify', () => {
  it('sends lockfiles + generated + vendored paths to boilerplate', () => {
    expect(classify('pnpm-lock.yaml')).toBe('boilerplate');
    expect(classify('server/package-lock.json')).toBe('boilerplate');
    expect(classify('client/dist/main.js')).toBe('boilerplate');
    expect(classify('client/src/vendor/shared/contracts/brief.ts')).toBe('boilerplate');
    expect(classify('server/src/db/migrations/0011_x.sql')).toBe('boilerplate');
    expect(classify('client/src/foo/__snapshots__/x.snap')).toBe('boilerplate');
  });

  it('sends configs, barrels and app wiring to wiring', () => {
    expect(classify('vitest.config.ts')).toBe('wiring');
    expect(classify('server/tsconfig.json')).toBe('wiring');
    expect(classify('server/package.json')).toBe('wiring');
    expect(classify('server/src/modules/index.ts')).toBe('wiring');
    expect(classify('server/src/server.ts')).toBe('wiring');
    expect(classify('.github/workflows/ci.yml')).toBe('wiring');
  });

  it('sends real business logic to core (the fall-through)', () => {
    expect(classify('server/src/modules/reviews/service.ts')).toBe('core');
    expect(classify('src/middleware/ratelimit.ts')).toBe('core');
    expect(classify('client/src/app/repos/page.tsx')).toBe('core');
  });

  it('classifies Windows-style backslash paths identically', () => {
    expect(classify('server\\src\\db\\migrations\\0011_x.sql')).toBe('boilerplate');
    expect(classify('server\\src\\modules\\reviews\\service.ts')).toBe('core');
  });
});

describe('composeSmartDiff', () => {
  const files: FileInput[] = [
    { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
    { path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
    { path: 'src/config.ts', additions: 4, deletions: 0 },
    { path: 'pnpm-lock.yaml', additions: 92, deletions: 24 },
  ];

  it('groups files core → wiring → boilerplate in that order', () => {
    const sd = composeSmartDiff(files, []);
    expect(sd.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(sd.groups.find((g) => g.role === 'boilerplate')!.files.map((f) => f.path)).toEqual([
      'pnpm-lock.yaml',
    ]);
  });

  it('maps findings to finding_lines on the cited file only (deduped + sorted)', () => {
    const findings: FindingInput[] = [
      { file: 'src/api/public/webhooks.ts', start_line: 73, severity: 'CRITICAL', title: 'SSRF' },
      { file: 'src/api/public/webhooks.ts', start_line: 61, severity: 'CRITICAL', title: 'token leak' },
      { file: 'src/api/public/webhooks.ts', start_line: 61, severity: 'WARNING', title: 'dupe line' },
      { file: 'src/config.ts', start_line: 12, severity: 'CRITICAL', title: 'hardcoded secret' },
    ];
    const sd = composeSmartDiff(files, findings);
    const core = sd.groups.find((g) => g.role === 'core')!;
    const webhooks = core.files.find((f) => f.path === 'src/api/public/webhooks.ts')!;
    expect(webhooks.finding_lines).toEqual([61, 73]);
    // pseudocode_summary is reused from the highest-severity finding's title.
    expect(webhooks.pseudocode_summary).toBe('SSRF');

    const ratelimit = core.files.find((f) => f.path === 'src/middleware/ratelimit.ts')!;
    expect(ratelimit.finding_lines).toEqual([]);
    expect(ratelimit.pseudocode_summary).toBeNull();
  });

  it('orders flagged files ahead of clean ones within a group', () => {
    const findings: FindingInput[] = [
      { file: 'src/api/public/webhooks.ts', start_line: 61, severity: 'CRITICAL', title: 'x' },
    ];
    const sd = composeSmartDiff(files, findings);
    const core = sd.groups.find((g) => g.role === 'core')!;
    // webhooks (37 lines, 1 finding) sorts before ratelimit (84 lines, 0 findings).
    expect(core.files[0]!.path).toBe('src/api/public/webhooks.ts');
  });

  it('flags too_big + proposes splits by directory past the threshold', () => {
    const big: FileInput[] = [
      { path: 'src/api/a.ts', additions: SPLIT_TOO_BIG_LINES, deletions: 0 },
      { path: 'src/db/b.ts', additions: 10, deletions: 0 },
    ];
    const sd = composeSmartDiff(big, []);
    expect(sd.split_suggestion.too_big).toBe(true);
    expect(sd.split_suggestion.total_lines).toBe(SPLIT_TOO_BIG_LINES + 10);
    expect(sd.split_suggestion.proposed_splits.map((s) => s.name).sort()).toEqual([
      'src/api',
      'src/db',
    ]);
  });

  it('does not flag a small PR', () => {
    const sd = composeSmartDiff(files, []);
    expect(sd.split_suggestion.too_big).toBe(false);
    expect(sd.split_suggestion.proposed_splits).toEqual([]);
  });

  it('excludes boilerplate churn from the split signal (a huge lock-file bump is not "too big")', () => {
    const lockBump: FileInput[] = [
      { path: 'pnpm-lock.yaml', additions: 5000, deletions: 4000 },
      { path: 'src/api/a.ts', additions: 5, deletions: 0 },
    ];
    const sd = composeSmartDiff(lockBump, []);
    expect(sd.split_suggestion.too_big).toBe(false);
    expect(sd.split_suggestion.total_lines).toBe(5); // reviewable lines only
  });

  it('composes from data alone — no LLM provider is part of the signature', () => {
    // The composition is a pure (files, findings) -> SmartDiff function: there is
    // no place to pass a model/provider, which is the structural guarantee that
    // Smart Diff makes zero new model calls.
    expect(composeSmartDiff.length).toBe(2);
  });
});
