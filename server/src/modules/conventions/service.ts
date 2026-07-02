import { readFile, access, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ConventionCandidate, LLMProvider } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { ConfigError } from '../../platform/errors.js';
import { ConventionsRepository } from './repository.js';
import { toConventionDto, buildSkillBody } from './helpers.js';
import { SkillsService } from '../skills/service.js';

/** Zod schema for the LLM structured output. */
const LLMCandidate = z.object({
  category: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
});

const LLMOutput = z.object({
  candidates: z.array(LLMCandidate),
});

const CONFIG_FILENAMES = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'tsconfig.json',
  'tsconfig.base.json',
  '.prettierrc',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.cjs',
  'package.json',
];

const PROVIDER_PRIORITY = ['openrouter', 'openai', 'anthropic'] as const;
const EXTRACTION_MODELS: Record<(typeof PROVIDER_PRIORITY)[number], string> = {
  openrouter: 'openai/gpt-4o-mini',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};
const CONFIDENCE_THRESHOLD = 0.6;
const MAX_FILE_CHARS = 4_000;
const MAX_SAMPLE_FILES = 12;

export class ConventionsService {
  private repo: ConventionsRepository;
  private skills: SkillsService;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.skills = new SkillsService(container);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { status?: 'candidate' | 'accepted' | 'rejected'; rule?: string; category?: string },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  async createSkillFromConventions(
    workspaceId: string,
    input: {
      repoId: string;
      conventionIds: string[];
      name: string;
      description: string;
      body: string;
      type: 'rubric' | 'convention' | 'security' | 'custom';
      enabled: boolean;
    },
  ) {
    const rows = await this.repo.getByIds(workspaceId, input.conventionIds);
    const evidenceFiles = [...new Set(rows.map((r) => r.evidencePath).filter(Boolean) as string[])];

    return this.skills.create(workspaceId, {
      name: input.name,
      description: input.description,
      type: input.type,
      source: 'extracted',
      body: input.body,
      enabled: input.enabled,
      evidenceFiles: evidenceFiles.length > 0 ? evidenceFiles : null,
    });
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const [repoRow] = await this.container.db
      .select({ clonePath: t.repos.clonePath, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    const clonePath = repoRow?.clonePath;
    const repoName = repoRow ? `${repoRow.owner}/${repoRow.name}` : 'unknown';

    // --- 1. Sample files ---
    const samplePaths = await this.gatherSamples(clonePath, repoId);
    if (samplePaths.length === 0) {
      return [];
    }

    // --- 2. Read file contents ---
    const fileContents: string[] = [];
    for (const filePath of samplePaths) {
      try {
        const absPath = clonePath ? join(clonePath, filePath) : filePath;
        const content = await readFile(absPath, 'utf-8');
        const truncated = content.length > MAX_FILE_CHARS ? content.slice(0, MAX_FILE_CHARS) + '\n… (truncated)' : content;
        fileContents.push(`### ${filePath}\n${truncated}`);
      } catch {
        // skip unreadable files
      }
    }

    if (fileContents.length === 0) return [];

    const systemPrompt = await this.loadSystemPrompt();
    const userMessage = `Repository: ${repoName}\n\nAnalyze these files and extract coding conventions:\n\n${fileContents.join('\n\n---\n\n')}\n\nExtract house conventions as JSON.`;

    // --- 3. LLM call ---
    const { llm, model } = await this.resolveProvider();
    const result = await llm.completeStructured({
      model,
      schema: LLMOutput,
      schemaName: 'ConventionExtraction',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      maxTokens: 2048,
    });

    // --- 4. Code-side evidence verification ---
    const aboveThreshold = result.data.candidates.filter((c) => c.confidence > CONFIDENCE_THRESHOLD);

    const verified: {
      rule: string;
      category: string;
      evidencePath: string;
      evidenceSnippet: string;
      confidence: number;
    }[] = [];

    for (const candidate of aboveThreshold) {
      if (!clonePath) continue;
      const absPath = join(clonePath, candidate.evidence_path);
      try {
        await access(absPath);
        const fileStat = await stat(absPath);
        if (!fileStat.isFile()) continue;

        const content = await readFile(absPath, 'utf-8');
        // Check that the first non-empty line of the snippet literally exists in the file.
        const anchorLine = candidate.evidence_snippet.split('\n').find((l) => l.trim().length > 0)?.trim();
        if (!anchorLine || !content.includes(anchorLine)) continue;

        verified.push({
          rule: candidate.rule,
          category: candidate.category,
          evidencePath: candidate.evidence_path,
          evidenceSnippet: candidate.evidence_snippet,
          confidence: candidate.confidence,
        });
      } catch {
        // file doesn't exist or can't be read → drop candidate
      }
    }

    if (verified.length === 0) return [];

    // --- 5. Persist (replace previous extraction for this repo) ---
    await this.repo.deleteByRepo(workspaceId, repoId);
    const inserted = await this.repo.insertMany(
      verified.map((v) => ({
        workspaceId,
        repoId,
        rule: v.rule,
        category: v.category,
        evidencePath: v.evidencePath,
        evidenceSnippet: v.evidenceSnippet,
        confidence: v.confidence,
      })),
    );

    return inserted.map(toConventionDto);
  }

  /** Build a merged skill body from accepted candidates (preview — not saved here). */
  buildMergedBody(candidates: ConventionCandidate[]): string {
    return buildSkillBody(candidates.filter((c) => c.status === 'accepted'));
  }

  // --- Private helpers ---

  private async resolveProvider(): Promise<{ llm: LLMProvider; model: string }> {
    for (const id of PROVIDER_PRIORITY) {
      try {
        const llm = await this.container.llm(id);
        return { llm, model: EXTRACTION_MODELS[id] };
      } catch {
        // key not configured, try next provider
      }
    }
    throw new ConfigError(
      'No LLM provider configured (set OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY)',
    );
  }

  private async gatherSamples(clonePath: string | null | undefined, repoId: string): Promise<string[]> {
    // Primary: repo-intel rank-based sampling
    const ranked = await this.container.repoIntel.getConventionSamples(repoId, MAX_SAMPLE_FILES);

    // Config files: always include if they exist on disk
    const configFiles: string[] = [];
    if (clonePath) {
      for (const name of CONFIG_FILENAMES) {
        try {
          await access(join(clonePath, name));
          configFiles.push(name);
        } catch {
          // not present
        }
      }
    }

    // Fallback: if no ranked files, scan src/ for .ts files
    let sourcePaths = ranked;
    if (sourcePaths.length === 0 && clonePath) {
      sourcePaths = await this.fallbackScan(clonePath);
    }

    const combined = [...new Set([...configFiles, ...sourcePaths])].slice(
      0,
      MAX_SAMPLE_FILES + configFiles.length,
    );
    return combined;
  }

  private async fallbackScan(clonePath: string): Promise<string[]> {
    const { readdir } = await import('node:fs/promises');
    const results: string[] = [];

    const walk = async (dir: string, depth: number) => {
      if (depth > 4 || results.length >= MAX_SAMPLE_FILES) return;
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= MAX_SAMPLE_FILES) break;
          const abs = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) continue;
            await walk(abs, depth + 1);
          } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            results.push(abs.replace(clonePath + '/', '').replace(clonePath + '\\', ''));
          }
        }
      } catch {
        // ignore unreadable dirs
      }
    };

    const srcDir = join(clonePath, 'src');
    try {
      await access(srcDir);
      await walk(srcDir, 0);
    } catch {
      await walk(clonePath, 0);
    }
    return results;
  }

  private async loadSystemPrompt(): Promise<string> {
    try {
      const { fileURLToPath } = await import('node:url');
      const { dirname } = await import('node:path');
      const dir = dirname(fileURLToPath(import.meta.url));
      const promptPath = resolve(dir, '../../prompts/conventions-extract.system.md');
      return await readFile(promptPath, 'utf-8');
    } catch {
      return 'Extract house conventions from the provided code samples. Return JSON with candidates array.';
    }
  }
}
