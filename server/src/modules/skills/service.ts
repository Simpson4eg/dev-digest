import type {
  Skill,
  SkillContextDocsResponse,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ValidationError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export type UpdateSkillInput = Partial<Omit<CreateSkillInput, 'source'>>;

export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    return (await this.repo.list(workspaceId)).map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    return toSkillDto(
      await this.repo.insert({
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source: input.source ?? 'manual',
        body: input.body,
        enabled: input.enabled,
        evidenceFiles: input.evidenceFiles ?? null,
      }),
    );
  }

  async update(workspaceId: string, id: string, input: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, input);
    return row ? toSkillDto(row) : undefined;
  }

  delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const rows = await this.repo.listVersions(workspaceId, id);
    return rows?.map(toSkillVersionDto);
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    if (!(await this.repo.getById(workspaceId, id))) return undefined;
    return this.repo.stats(workspaceId, id);
  }

  // ---- Context-doc attachment (Task 5) ------------------------------------

  /**
   * Get the ordered list of context-doc paths attached to a skill.
   * Returns undefined when the skill doesn't exist in this workspace (→ 404).
   */
  async getContextDocs(
    workspaceId: string,
    skillId: string,
  ): Promise<SkillContextDocsResponse | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.linkedContextDocs(workspaceId, skillId);
    return { paths: rows.map((r) => r.path) };
  }

  /**
   * Replace the full ordered set of context-doc paths for a skill (AC-5, AC-7).
   * Mirrors the agent-side setContextDocs pattern.
   *
   * Tenant safety: skill existence check is workspace-scoped (INSIGHTS 2026-06-29).
   * Duplicate-path check ensures the stored list is a proper ordered set.
   *
   * Returns undefined when the skill doesn't exist in this workspace (→ 404).
   */
  async setContextDocs(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<SkillContextDocsResponse | undefined> {
    // Tenant safety: must verify skill belongs to this workspace before writing.
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;

    if (new Set(paths).size !== paths.length) {
      throw new ValidationError('paths must not contain duplicates');
    }

    // Full-replace (mirrors setContextDocs repo pattern).
    await this.repo.setContextDocs(skillId, paths);

    const rows = await this.repo.linkedContextDocs(workspaceId, skillId);
    return { paths: rows.map((r) => r.path) };
  }
}
