import { describe, it, expect } from 'vitest';
import type { BlastResult } from '../repo-intel/types.js';
import { shapeBlastRadius, MAX_CALLERS_PER_SYMBOL } from './shape.js';

/** Persistent-path fixture: two changed symbols, cross-file callers, per-file facts. */
const PERSISTENT: BlastResult = {
  changedSymbols: [
    { file: 'src/mw.ts', name: 'rateLimit', kind: 'function' },
    { file: 'src/key.ts', name: 'bucketKey', kind: 'function' },
    { file: 'src/dead.ts', name: 'unused', kind: 'function' }, // no callers → no downstream
  ],
  callers: [
    { file: 'src/api/public/index.ts', symbol: 'handler', viaSymbol: 'rateLimit', line: 23, rank: 90 },
    { file: 'src/api/public/webhooks.ts', symbol: 'hook', viaSymbol: 'rateLimit', line: 45, rank: 40 },
    { file: 'src/key.spec.ts', symbol: 'test', viaSymbol: 'bucketKey', line: 5, rank: 10 },
  ],
  impactedEndpoints: ['GET /api/public/items', 'POST /api/public/webhooks'],
  factsByFile: {
    'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
    'src/api/public/webhooks.ts': { endpoints: ['POST /api/public/webhooks'], crons: ['reset-rate-buckets'] },
  },
  degraded: false,
};

describe('shapeBlastRadius', () => {
  it('maps changed symbols 1:1', () => {
    const out = shapeBlastRadius(PERSISTENT);
    expect(out.changed_symbols).toHaveLength(3);
    expect(out.changed_symbols[0]).toEqual({ name: 'rateLimit', file: 'src/mw.ts', kind: 'function' });
  });

  it('groups flat callers under the symbol they reach (viaSymbol)', () => {
    const out = shapeBlastRadius(PERSISTENT);
    const rate = out.downstream.find((d) => d.symbol === 'rateLimit')!;
    expect(rate.callers.map((c) => c.file)).toEqual([
      'src/api/public/index.ts',
      'src/api/public/webhooks.ts',
    ]);
    expect(rate.callers[0]).toEqual({ name: 'handler', file: 'src/api/public/index.ts', line: 23 });
  });

  it('omits changed symbols that have no callers', () => {
    const out = shapeBlastRadius(PERSISTENT);
    expect(out.downstream.map((d) => d.symbol)).not.toContain('unused');
  });

  it('attributes endpoints/crons per caller file from factsByFile', () => {
    const out = shapeBlastRadius(PERSISTENT);
    const rate = out.downstream.find((d) => d.symbol === 'rateLimit')!;
    expect(rate.endpoints_affected.sort()).toEqual([
      'GET /api/public/items',
      'POST /api/public/webhooks',
    ]);
    expect(rate.crons_affected).toEqual(['reset-rate-buckets']);
  });

  it('emits zero LLM summary and passes degraded/reason through', () => {
    const out = shapeBlastRadius(PERSISTENT);
    expect(out.summary).toBe('');
    expect(out.degraded).toBe(false);
    expect(out.reason).toBeUndefined();
  });

  it('falls back to the flat endpoint union on the degraded path (no factsByFile)', () => {
    const degraded: BlastResult = {
      changedSymbols: [{ file: 'src/mw.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/index.ts', symbol: 'h', viaSymbol: 'rateLimit', line: 3, rank: 0 },
      ],
      impactedEndpoints: ['GET /api/public/items'],
      degraded: true,
      reason: 'no_data',
    };
    const out = shapeBlastRadius(degraded);
    const rate = out.downstream[0]!;
    expect(rate.endpoints_affected).toEqual(['GET /api/public/items']);
    expect(rate.crons_affected).toEqual([]);
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('no_data');
  });

  it('caps callers per symbol at MAX_CALLERS_PER_SYMBOL', () => {
    const many: BlastResult = {
      changedSymbols: [{ file: 'src/mw.ts', name: 'f', kind: 'function' }],
      callers: Array.from({ length: MAX_CALLERS_PER_SYMBOL + 5 }, (_, i) => ({
        file: `src/c${i}.ts`,
        symbol: `s${i}`,
        viaSymbol: 'f',
        line: i + 1,
        rank: 0,
      })),
      impactedEndpoints: [],
    };
    const out = shapeBlastRadius(many);
    expect(out.downstream[0]!.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
  });

  it('returns an empty, non-throwing shape for an empty degraded result', () => {
    const out = shapeBlastRadius({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'index_partial',
    });
    expect(out.changed_symbols).toEqual([]);
    expect(out.downstream).toEqual([]);
    expect(out.degraded).toBe(true);
  });
});
