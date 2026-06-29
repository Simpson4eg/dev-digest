import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate';
import type { SkillImportPreview, SkillType } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';

const MAX_FILE_BYTES = 1_048_576;
const MAX_SKILL_BYTES = 262_144;
const MAX_ARCHIVE_ENTRIES = 100;
const SKILL_TYPES = new Set<SkillType>(['rubric', 'convention', 'security', 'custom']);

interface ArchiveEntry {
  name: string;
  originalSize: number;
}

function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\.(md|markdown)$/i, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'imported-skill';
}

function scalar(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseMarkdown(markdown: string, sourceFile: string, ignoredFiles: string[]): SkillImportPreview {
  const warnings: string[] = [];
  let body = markdown.replace(/^\uFEFF/, '').trim();
  const meta = new Map<string, string>();
  const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatter) {
    for (const line of frontmatter[1]!.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (match) meta.set(match[1]!.toLowerCase(), scalar(match[2]!));
    }
    body = body.slice(frontmatter[0].length).trim();
  }
  if (!body) throw new ValidationError('The imported skill has an empty Markdown body');
  if (Buffer.byteLength(body, 'utf8') > MAX_SKILL_BYTES) {
    throw new ValidationError(`Skill Markdown exceeds ${MAX_SKILL_BYTES} bytes`);
  }

  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const name = normalizeName(meta.get('name') || heading || sourceFile.split('/').pop() || 'imported-skill');
  const rawType = meta.get('type') as SkillType | undefined;
  const type = rawType && SKILL_TYPES.has(rawType) ? rawType : 'custom';
  if (rawType && !SKILL_TYPES.has(rawType)) warnings.push(`Unknown type "${rawType}"; using custom.`);

  let description = (meta.get('description') || '').trim();
  if (!description) {
    description = `Apply ${name} instructions during pull-request review.`;
    warnings.push('No description found; a directive description was generated.');
  }

  return {
    name,
    description: description.slice(0, 500),
    type,
    body,
    source_file: sourceFile,
    ignored_files: ignoredFiles,
    warnings,
  };
}

function archiveMarkdown(data: Uint8Array): { markdown: string; sourceFile: string; ignored: string[] } {
  const entries: ArchiveEntry[] = [];
  unzipSync(data, {
    filter(file: UnzipFileInfo) {
      entries.push({ name: file.name.replaceAll('\\', '/'), originalSize: file.originalSize });
      if (entries.length > MAX_ARCHIVE_ENTRIES) {
        throw new ValidationError(`Archive contains more than ${MAX_ARCHIVE_ENTRIES} entries`);
      }
      return false;
    },
  });

  const files = entries.filter((entry) => !entry.name.endsWith('/'));
  const skillFiles = files.filter((entry) => /(^|\/)SKILL\.md$/i.test(entry.name));
  const markdownFiles = files.filter((entry) => /\.(md|markdown)$/i.test(entry.name));
  const candidates = skillFiles.length > 0 ? skillFiles : markdownFiles;
  if (candidates.length === 0) throw new ValidationError('Archive contains no SKILL.md or Markdown file');
  if (candidates.length > 1) {
    throw new ValidationError('Archive must contain exactly one SKILL.md (or one Markdown file)');
  }
  const selected = candidates[0]!;
  if (selected.originalSize > MAX_SKILL_BYTES) {
    throw new ValidationError(`Skill Markdown exceeds ${MAX_SKILL_BYTES} bytes`);
  }

  const extracted = unzipSync(data, {
    filter(file) {
      return file.name.replaceAll('\\', '/') === selected.name;
    },
  });
  const bytes = Object.values(extracted)[0];
  if (!bytes) throw new ValidationError('Could not extract skill Markdown from archive');
  return {
    markdown: strFromU8(bytes),
    sourceFile: selected.name,
    ignored: files.filter((entry) => entry.name !== selected.name).map((entry) => entry.name),
  };
}

export function previewSkillImport(filename: string, data: Uint8Array): SkillImportPreview {
  if (data.byteLength === 0) throw new ValidationError('Import file is empty');
  if (data.byteLength > MAX_FILE_BYTES) throw new ValidationError('Import file exceeds 1 MiB');
  const isZip = /\.zip$/i.test(filename) || (data[0] === 0x50 && data[1] === 0x4b);
  if (isZip) {
    try {
      const extracted = archiveMarkdown(data);
      return parseMarkdown(extracted.markdown, extracted.sourceFile, extracted.ignored);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError('Invalid or unsupported ZIP archive');
    }
  }
  if (!/\.(md|markdown)$/i.test(filename)) {
    throw new ValidationError('Only Markdown (.md) and ZIP (.zip) files are supported');
  }
  return parseMarkdown(strFromU8(data), filename, []);
}
