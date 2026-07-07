import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunSummary } from '@devdigest/shared';
import type { PriceBook } from '../../platform/price-book.js';

// ---------------------------------------------------------------------------
// Lightweight stubs — we only instantiate ReviewService so we need to
// prevent its constructor from building a real ReviewRepository (which needs
// a live Db). We do this by mocking the module that exports ReviewRepository.
// ---------------------------------------------------------------------------

vi.mock('./repository.js', () => {
  return {
    ReviewRepository: vi.fn().mockImplementation(() => ({
      getRunById: vi.fn(),
    })),
  };
});

// Also stub the run-executor (imported by service constructor) to avoid
// transitive adapter imports.
vi.mock('./run-executor.js', () => {
  return {
    ReviewRunExecutor: vi.fn().mockImplementation(() => ({})),
  };
});

import { ReviewService } from './service.js';
import { ReviewRepository } from './repository.js';

/** Build a fake PriceBook with a fixed estimator. */
function fakePriceBook(map: Record<string, { in: number; out: number }>): PriceBook {
  return {
    estimate(model: string, tokensIn: number, tokensOut: number) {
      const p = map[model];
      if (!p) return null;
      return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
    },
  } as unknown as PriceBook;
}

/** Minimal RunSummary fixture (all nullable fields set). */
const BASE_RUN: RunSummary = {
  run_id: 'run-abc',
  agent_id: 'agent-1',
  agent_name: 'Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  status: 'done',
  error: null,
  duration_ms: 1500,
  tokens_in: 1_000_000,
  tokens_out: 500_000,
  findings_count: 3,
  grounding: '100%',
  ran_at: '2026-07-07T00:00:00.000Z',
  score: 85,
  blockers: 0,
};

function makeContainer(priceBook: PriceBook) {
  return {
    db: {} as never,
    agentsRepo: { listEnabled: vi.fn(), getById: vi.fn() } as never,
    priceBook,
    runBus: {} as never,
  } as never;
}

describe('ReviewService.getRun', () => {
  let getRunById: ReturnType<typeof vi.fn>;
  let service: ReviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    const pb = fakePriceBook({ 'gpt-4.1': { in: 2.0, out: 8.0 } });
    const container = makeContainer(pb);
    service = new ReviewService(container);
    // Access the mock instance created by the constructor
    const repoInstance = vi.mocked(ReviewRepository).mock.results[0]!.value as {
      getRunById: ReturnType<typeof vi.fn>;
    };
    getRunById = repoInstance.getRunById;
  });

  it('returns the run enriched with cost_usd when repo returns a row', async () => {
    getRunById.mockResolvedValue({ ...BASE_RUN });

    const result = await service.getRun('ws-1', 'run-abc');

    expect(getRunById).toHaveBeenCalledWith('ws-1', 'run-abc');
    expect(result).not.toBeNull();
    // cost_usd = (1_000_000 * 2.0 + 500_000 * 8.0) / 1_000_000 = 2 + 4 = 6
    expect(result!.cost_usd).toBe(6);
    // All base fields are preserved
    expect(result!.run_id).toBe('run-abc');
    expect(result!.status).toBe('done');
    expect(result!.model).toBe('gpt-4.1');
  });

  it('returns null when the repo returns null (run not found or wrong workspace)', async () => {
    getRunById.mockResolvedValue(null);

    const result = await service.getRun('ws-1', 'run-unknown');

    expect(getRunById).toHaveBeenCalledWith('ws-1', 'run-unknown');
    expect(result).toBeNull();
  });

  it('sets cost_usd to null when the model is not in PriceBook', async () => {
    getRunById.mockResolvedValue({ ...BASE_RUN, model: 'mystery-model' });

    const result = await service.getRun('ws-1', 'run-abc');

    expect(result).not.toBeNull();
    expect(result!.cost_usd).toBeNull();
  });

  it('sets cost_usd to null when tokens are zero (running run)', async () => {
    getRunById.mockResolvedValue({
      ...BASE_RUN,
      tokens_in: 0,
      tokens_out: 0,
    });

    const result = await service.getRun('ws-1', 'run-abc');

    expect(result).not.toBeNull();
    expect(result!.cost_usd).toBeNull();
  });
});
