import type { PriceBook } from '../../platform/price-book.js';

/**
 * Compute USD cost for one agent run from its persisted token counts.
 *
 * Returns null when (a) tokens were never recorded (null or 0/0), or
 * (b) the model is not in PriceBook's live + fallback maps. The UI renders
 * "—" for null; never "$0.00" (see CLAUDE.md cost convention).
 *
 * Pure / synchronous: PriceBook.estimate is sync by design (see its docstring).
 */
export function runCostUsd(
  run: { model: string | null; tokensIn: number | null; tokensOut: number | null },
  priceBook: PriceBook,
): number | null {
  if (!run.model) return null;
  const tIn = run.tokensIn ?? 0;
  const tOut = run.tokensOut ?? 0;
  if (tIn === 0 && tOut === 0) return null;
  return priceBook.estimate(run.model, tIn, tOut);
}

/**
 * Sum cost across an arbitrary set of runs. Runs with null cost
 * contribute zero (we don't poison the sum with "unknown"); however, if EVERY
 * run yields null, the result is null so the UI renders "—" instead of "$0".
 */
export function sumRunCostUsd(
  runs: ReadonlyArray<{ model: string | null; tokensIn: number | null; tokensOut: number | null }>,
  priceBook: PriceBook,
): number | null {
  let total = 0;
  let anyKnown = false;
  for (const r of runs) {
    const c = runCostUsd(r, priceBook);
    if (c != null) {
      total += c;
      anyKnown = true;
    }
  }
  return anyKnown ? total : null;
}
