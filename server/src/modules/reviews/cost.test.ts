import { describe, it, expect } from 'vitest';
import { runCostUsd, sumRunCostUsd } from './cost.js';
import type { PriceBook } from '../../platform/price-book.js';

/** Stub PriceBook that only knows the models we hand-feed it. */
function fakePriceBook(map: Record<string, { in: number; out: number }>): PriceBook {
  return {
    estimate(model: string, tokensIn: number, tokensOut: number) {
      const p = map[model];
      if (!p) return null;
      return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
    },
  } as unknown as PriceBook;
}

describe('runCostUsd', () => {
  const pb = fakePriceBook({ 'gpt-4.1': { in: 2.0, out: 8.0 } });

  it('computes cost for a known model with tokens', () => {
    expect(runCostUsd({ model: 'gpt-4.1', tokensIn: 1_000_000, tokensOut: 0 }, pb)).toBe(2);
    expect(runCostUsd({ model: 'gpt-4.1', tokensIn: 0, tokensOut: 1_000_000 }, pb)).toBe(8);
  });

  it('returns null when the model is unknown', () => {
    expect(runCostUsd({ model: 'mystery-model', tokensIn: 100, tokensOut: 100 }, pb)).toBeNull();
  });

  it('returns null when tokens are missing/zero (never $0.00)', () => {
    expect(runCostUsd({ model: 'gpt-4.1', tokensIn: null, tokensOut: null }, pb)).toBeNull();
    expect(runCostUsd({ model: 'gpt-4.1', tokensIn: 0, tokensOut: 0 }, pb)).toBeNull();
  });

  it('returns null when model is null (running run, no model picked yet)', () => {
    expect(runCostUsd({ model: null, tokensIn: 100, tokensOut: 100 }, pb)).toBeNull();
  });
});

describe('sumRunCostUsd', () => {
  const pb = fakePriceBook({ 'gpt-4.1': { in: 2.0, out: 8.0 } });

  it('sums costs across runs (unknown rows contribute zero, not null)', () => {
    const total = sumRunCostUsd(
      [
        { model: 'gpt-4.1', tokensIn: 1_000_000, tokensOut: 0 }, // $2
        { model: 'mystery', tokensIn: 999_999, tokensOut: 999_999 }, // null → skipped
        { model: 'gpt-4.1', tokensIn: 0, tokensOut: 1_000_000 }, // $8
      ],
      pb,
    );
    expect(total).toBe(10);
  });

  it('returns null when every run yields null (so the UI renders "—" not "$0")', () => {
    const total = sumRunCostUsd(
      [
        { model: 'mystery', tokensIn: 100, tokensOut: 100 },
        { model: 'gpt-4.1', tokensIn: 0, tokensOut: 0 },
        { model: null, tokensIn: 100, tokensOut: 100 },
      ],
      pb,
    );
    expect(total).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(sumRunCostUsd([], pb)).toBeNull();
  });
});
