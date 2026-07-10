/**
 * Unit tests for the project-context discovery core (AC-1, AC-2, AC-3, AC-13).
 *
 * These tests are fully hermetic (no IO, no Container, no LLM) — they exercise
 * the pure `filterContextPaths` and `buildContextGlobs` functions over
 * in-memory path fixtures.
 */
import { describe, it, expect } from 'vitest';
import { filterContextPaths, buildContextGlobs } from './discover.js';

const DEFAULT_FOLDERS = ['specs', 'docs', 'insights'];

describe('buildContextGlobs', () => {
  it('produces one glob per folder name', () => {
    const globs = buildContextGlobs(['specs', 'docs']);
    expect(globs).toEqual(['**/specs/**/*.md', '**/docs/**/*.md']);
  });

  it('returns an empty array for an empty folder list', () => {
    expect(buildContextGlobs([])).toEqual([]);
  });
});

describe('filterContextPaths', () => {
  it('returns [] for an empty path list (AC-3: empty repo)', () => {
    expect(filterContextPaths([], DEFAULT_FOLDERS)).toEqual([]);
  });

  it('returns [] when no folder names are configured', () => {
    expect(filterContextPaths(['specs/SPEC-01.md'], [])).toEqual([]);
  });

  it('discovers a top-level specs/file.md', () => {
    const paths = ['specs/SPEC-01.md', 'src/index.ts'];
    expect(filterContextPaths(paths, DEFAULT_FOLDERS)).toEqual(['specs/SPEC-01.md']);
  });

  it('discovers nested docs/a/b.md at any depth (AC-1)', () => {
    const paths = ['docs/a/b.md', 'src/README.md'];
    expect(filterContextPaths(paths, DEFAULT_FOLDERS)).toEqual(['docs/a/b.md']);
  });

  it('discovers deeply nested insights/level1/level2/note.md', () => {
    const paths = ['insights/level1/level2/note.md'];
    expect(filterContextPaths(paths, DEFAULT_FOLDERS)).toEqual([
      'insights/level1/level2/note.md',
    ]);
  });

  it('excludes .txt and other non-.md files (AC-1: only .md)', () => {
    const paths = ['docs/guide.txt', 'specs/SPEC-01.md'];
    expect(filterContextPaths(paths, DEFAULT_FOLDERS)).toEqual(['specs/SPEC-01.md']);
  });

  it('excludes files outside all configured folder names (AC-1)', () => {
    const paths = [
      'README.md',              // root-level, not under a folder
      'src/notes.md',           // under src/, not configured
      'docs/guide.md',          // configured ✓
      'other/SPEC-01.md',       // under other/, not configured
    ];
    expect(filterContextPaths(paths, DEFAULT_FOLDERS)).toEqual(['docs/guide.md']);
  });

  it('handles all three default folder names', () => {
    const paths = [
      'specs/SPEC-01.md',
      'docs/api.md',
      'insights/INSIGHTS.md',
      'other/notes.md',
    ];
    const result = filterContextPaths(paths, DEFAULT_FOLDERS);
    expect(result).toEqual(['specs/SPEC-01.md', 'docs/api.md', 'insights/INSIGHTS.md']);
  });

  it('uses the exact configured folder names (AC-2: not hard-coded)', () => {
    // Custom folder names — only "guides" matches
    const paths = ['guides/intro.md', 'docs/api.md', 'guides/advanced/deep.md'];
    const result = filterContextPaths(paths, ['guides']);
    expect(result).toEqual(['guides/intro.md', 'guides/advanced/deep.md']);
    // "docs" is NOT in the custom list → excluded
    expect(result).not.toContain('docs/api.md');
  });

  it('does not treat a filename segment as a folder name', () => {
    // A file named "docs.md" at root-level should NOT match the "docs" folder
    expect(filterContextPaths(['docs.md'], DEFAULT_FOLDERS)).toEqual([]);
    // But docs/docs.md should match (the directory segment is "docs")
    expect(filterContextPaths(['docs/docs.md'], DEFAULT_FOLDERS)).toEqual(['docs/docs.md']);
  });

  it('preserves the original order of discovered paths', () => {
    const paths = [
      'insights/b.md',
      'docs/a.md',
      'specs/c.md',
    ];
    expect(filterContextPaths(paths, DEFAULT_FOLDERS)).toEqual([
      'insights/b.md',
      'docs/a.md',
      'specs/c.md',
    ]);
  });
});
