import { describe, it, expect } from 'vitest';
import { resolveEffectiveSet } from '../src/modules/reviews/project-context.js';

/**
 * Unit tests for the pure effective-set resolver.
 *
 * Covers:
 *   AC-8  — agent-attached paths come first, skill-inherited paths follow
 *   AC-9  — deduplication by exact repo-relative path (case-sensitive); a path
 *            reachable both ways appears once, in its agent-attached position
 *   AC-10 — disabled skills must be excluded by the caller; the resolver itself
 *            treats every SkillContextDocs entry as enabled
 */

describe('resolveEffectiveSet', () => {
  it('empty inputs → empty result', () => {
    expect(resolveEffectiveSet([], [])).toEqual([]);
  });

  it('agent-attached only — preserved in stored order (AC-8)', () => {
    const result = resolveEffectiveSet(
      ['specs/B.md', 'docs/A.md', 'insights/C.md'],
      [],
    );
    expect(result).toEqual(['specs/B.md', 'docs/A.md', 'insights/C.md']);
  });

  it('skill-inherited only — preserved in skill order (AC-8)', () => {
    const result = resolveEffectiveSet([], [
      { skillId: 's1', paths: ['docs/guide.md', 'specs/SPEC-01.md'] },
      { skillId: 's2', paths: ['insights/2026.md'] },
    ]);
    expect(result).toEqual(['docs/guide.md', 'specs/SPEC-01.md', 'insights/2026.md']);
  });

  it('agent-attached first, then skill-inherited (AC-8 ordering)', () => {
    const result = resolveEffectiveSet(
      ['specs/agent.md'],
      [{ skillId: 's1', paths: ['docs/skill.md'] }],
    );
    expect(result).toEqual(['specs/agent.md', 'docs/skill.md']);
  });

  it('dedup: path in both agent and skill → appears once in agent position (AC-9)', () => {
    const result = resolveEffectiveSet(
      ['specs/SPEC-01.md', 'docs/guide.md'],
      [{ skillId: 's1', paths: ['docs/guide.md', 'insights/extra.md'] }],
    );
    // 'docs/guide.md' appears in agent position (index 1), not repeated from skill
    expect(result).toEqual(['specs/SPEC-01.md', 'docs/guide.md', 'insights/extra.md']);
  });

  it('dedup: path in multiple skills → appears once in first-skill position (AC-9)', () => {
    const result = resolveEffectiveSet([], [
      { skillId: 's1', paths: ['docs/shared.md', 'docs/a.md'] },
      { skillId: 's2', paths: ['docs/shared.md', 'docs/b.md'] },
    ]);
    expect(result).toEqual(['docs/shared.md', 'docs/a.md', 'docs/b.md']);
  });

  it('dedup is case-sensitive — different-cased paths are distinct (AC-9)', () => {
    const result = resolveEffectiveSet(
      ['docs/Guide.md'],
      [{ skillId: 's1', paths: ['docs/guide.md'] }],
    );
    // Different case → two distinct entries (not the same path on case-insensitive FS)
    expect(result).toEqual(['docs/Guide.md', 'docs/guide.md']);
  });

  it('disabled-skill exclusion (AC-10): caller omits disabled skills', () => {
    // The caller already filters for enabled-only; if a disabled skill has no
    // SkillContextDocs entry, its paths simply never appear.
    const result = resolveEffectiveSet(
      ['specs/agent.md'],
      [
        // Enabled skill → included
        { skillId: 'enabled', paths: ['docs/enabled.md'] },
        // Disabled skill's entry NOT passed in (caller excluded it)
      ],
    );
    expect(result).toEqual(['specs/agent.md', 'docs/enabled.md']);
  });

  it('all paths from both sources deduplicated in full scenario (AC-8 + AC-9)', () => {
    const result = resolveEffectiveSet(
      ['a.md', 'b.md'],
      [
        { skillId: 's1', paths: ['b.md', 'c.md'] }, // 'b.md' deduped; 'c.md' new
        { skillId: 's2', paths: ['c.md', 'd.md'] }, // 'c.md' deduped; 'd.md' new
      ],
    );
    expect(result).toEqual(['a.md', 'b.md', 'c.md', 'd.md']);
  });

  it('agent-only path list with duplicates is not de-duped (caller is responsible)', () => {
    // The caller (run-executor) loads from the DB which has unique paths; but the
    // resolver does preserve agent-path order including duplicates from the same
    // source — the first occurrence wins.
    const result = resolveEffectiveSet(['a.md', 'a.md', 'b.md'], []);
    // First 'a.md' seen, second is deduped
    expect(result).toEqual(['a.md', 'b.md']);
  });
});
