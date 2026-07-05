/**
 * Smart Diff — classification patterns + thresholds.
 *
 * These are the ONLY tunables for the risk-ordered diff layout. They live here
 * (not inlined in classify.ts) so a reviewer can retune what counts as
 * boilerplate/wiring, and how large a PR must be to earn a split suggestion,
 * without touching logic. Acceptance criterion: thresholds are constants, not
 * baked into code.
 *
 * A path matches a group if ANY of its RegExps matches the POSIX (forward-slash,
 * repo-relative) path. Precedence is boilerplate → wiring → core (see
 * `classify`): the first list that matches wins, and `core` is the fall-through
 * for real business logic.
 */

/** Generated / mechanical files — collapsed by default, skimmed last. */
export const BOILERPLATE_PATTERNS: RegExp[] = [
  // Dependency lockfiles — the canonical "always collapse me" case.
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb|composer\.lock|Cargo\.lock|poetry\.lock|Gemfile\.lock)$/,
  // Build / generated output directories.
  /(^|\/)(dist|build|out|coverage|\.next)\//,
  // Minified / sourcemaps / snapshots / explicitly-generated files.
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.snap$/,
  /\.generated\.[^/]+$/,
  /(^|\/)__snapshots__\//,
  // Vendored copies (e.g. client/src/vendor/**) and generated DB migrations.
  /(^|\/)vendor\//,
  /(^|\/)migrations\//,
];

/** Configs, barrels and app wiring — read after the core, before boilerplate. */
export const WIRING_PATTERNS: RegExp[] = [
  // Tooling / build config + a `config.*` module (app configuration wiring).
  /(^|\/)[^/]+\.config\.(ts|js|mjs|cjs)$/,
  /(^|\/)config\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)package\.json$/,
  /(^|\/)(next|drizzle|vitest|eslint|prettier|tailwind|postcss)\.[^/]+$/,
  // Barrels / app entrypoints.
  /(^|\/)index\.(ts|tsx|js|jsx)$/,
  /(^|\/)(server|app)\.(ts|tsx|js|jsx)$/,
  // Env / CI / infra.
  /(^|\/)\.env(\.[^/]+)?$/,
  /(^|\/)\.github\//,
  /\.ya?ml$/,
  /(^|\/)Dockerfile$/,
  /(^|\/)docker-compose\.[^/]+$/,
];

/**
 * Total changed lines (additions + deletions across ALL files) ABOVE which the
 * PR is flagged "too big" and offered a split suggestion.
 */
export const SPLIT_TOO_BIG_LINES = 400;
