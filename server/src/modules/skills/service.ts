import type { Skill, SkillSource, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
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
}
