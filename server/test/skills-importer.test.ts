import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { previewSkillImport } from '../src/modules/skills/importer.js';

describe('skill import preview', () => {
  it('parses supported frontmatter from a Markdown file', () => {
    const result = previewSkillImport(
      'security.md',
      strToU8('---\nname: secret-gate\ndescription: Detect committed secrets.\ntype: security\n---\n# Rules\nNever allow live keys.'),
    );
    expect(result).toMatchObject({
      name: 'secret-gate',
      description: 'Detect committed secrets.',
      type: 'security',
      source_file: 'security.md',
      ignored_files: [],
    });
    expect(result.body).toContain('Never allow live keys.');
  });

  it('extracts only SKILL.md from ZIP and reports executable files as ignored', () => {
    const zip = zipSync({
      'api-skill/SKILL.md': strToU8('# API contract\nFlag removed response fields.'),
      'api-skill/run.sh': strToU8('exit 99'),
      'api-skill/reference.md': strToU8('supporting material'),
    });
    const result = previewSkillImport('api-skill.zip', zip);
    expect(result.source_file).toBe('api-skill/SKILL.md');
    expect(result.body).not.toContain('exit 99');
    expect(result.ignored_files).toEqual(
      expect.arrayContaining(['api-skill/run.sh', 'api-skill/reference.md']),
    );
  });

  it('rejects an archive containing multiple skill roots', () => {
    const zip = zipSync({
      'one/SKILL.md': strToU8('# One'),
      'two/SKILL.md': strToU8('# Two'),
    });
    expect(() => previewSkillImport('many.zip', zip)).toThrow(/exactly one SKILL\.md/);
  });
});
