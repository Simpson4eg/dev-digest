import type { SmartDiffRole } from '@devdigest/shared';
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS } from './constants.js';

/**
 * Classify a changed file into a review-risk role from its PATH alone —
 * deterministic, no diff body, no model call. Precedence: boilerplate → wiring
 * → core. `core` is the fall-through: real business logic a reviewer should read
 * first. Paths are normalized to POSIX separators so diffs imported on Windows
 * classify identically.
 */
export function classify(path: string): SmartDiffRole {
  const p = path.replace(/\\/g, '/');
  if (BOILERPLATE_PATTERNS.some((re) => re.test(p))) return 'boilerplate';
  if (WIRING_PATTERNS.some((re) => re.test(p))) return 'wiring';
  return 'core';
}
