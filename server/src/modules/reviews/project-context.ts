/**
 * Project-context effective-set resolver — pure, no Container.
 *
 * Computes the ordered, deduped effective document set from two sources:
 *   1. Paths directly attached to the agent (agent-attached order)
 *   2. Paths inherited from ENABLED skills (skill-inherited order)
 *
 * Agent-attached paths come first; a path reachable from both sources
 * appears exactly once, in its agent-attached position (AC-8, AC-9).
 * Deduplication is case-sensitive by exact repo-relative path (AC-9).
 * Disabled skills must be excluded by the caller before passing skill paths (AC-10).
 */

/**
 * One skill's contribution: the skill id (for debugging) + its ordered
 * context-doc paths (already filtered for enabled-only by the caller).
 */
export interface SkillContextDocs {
  skillId: string;
  paths: string[];
}

/**
 * Resolve the ordered, deduped effective document set for a run.
 *
 * @param agentPaths  Paths attached directly to the agent, in stored order.
 * @param skillDocs   Per-enabled-skill path lists, in skill order (from
 *                    `linkedSkills` order × each skill's stored doc order).
 *                    Only ENABLED skills must be included (AC-10).
 * @returns           Ordered array of unique repo-relative paths: agent-
 *                    attached first, then skill-inherited. A path that appears
 *                    in both sources is kept only at its agent-attached position.
 */
export function resolveEffectiveSet(
  agentPaths: readonly string[],
  skillDocs: readonly SkillContextDocs[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // Agent-attached paths first (stored order, AC-8 / AC-6)
  for (const path of agentPaths) {
    if (!seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }

  // Skill-inherited paths next, in skill-link order then per-skill doc order
  // (AC-8). A path already in `seen` (from agent or an earlier skill) is
  // deduplicated and NOT re-added (AC-9).
  for (const { paths } of skillDocs) {
    for (const path of paths) {
      if (!seen.has(path)) {
        seen.add(path);
        result.push(path);
      }
    }
  }

  return result;
}
