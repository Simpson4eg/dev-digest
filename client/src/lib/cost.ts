/**
 * USD cost formatting for the Run Cost Badge feature.
 *
 * One source of truth used by four surfaces: PR list cost column, PR detail
 * verdict bar, timeline row, and run trace sidebar Stats tile. Server
 * computes the number; UI just renders it.
 *
 * Empty-data convention (see CLAUDE.md / SKILL spec): null/undefined render
 * as "—", NEVER "$0.00". A truly-known $0 (free model) still renders "$0".
 *
 * Format ladder: 4 decimals for sub-cent, 3 for sub-dollar, 2 for >=1.
 * Tuned to match the slide examples ($0.0013, $0.014, $0.06).
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Total tokens as a localized integer with "tok" suffix (e.g. "9,119 tok"). */
export function formatTokenTotal(total: number | null | undefined): string {
  if (total == null) return "—";
  return `${total.toLocaleString("en-US")} tok`;
}

/**
 * Token in→out summary (e.g. "12k→1.5k"). Used by the verdict-plaque cost line
 * and the run-trace Stats tile. Returns "—" when either side is missing so
 * the empty-data convention is uniform.
 */
export function formatTokensInOut(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string {
  if (tokensIn == null || tokensOut == null) return "—";
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}
