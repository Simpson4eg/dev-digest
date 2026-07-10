import type { Container } from '../../platform/container.js';
import type { ContextDocListResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildContextGlobs } from './discover.js';

/**
 * Project Context service — the ZERO-LLM discovery step (AC-13).
 *
 * Given a workspace + repoId, discovers every `.md` file under the configured
 * context folder names in the cloned repo and returns them as repo-relative
 * paths. No model call, no write — this only reads the filesystem via the
 * GitClient port.
 *
 * Empty repo / no matching folders → returns { docs: [] } (AC-3).
 */
export class ProjectContextService {
  constructor(private container: Container) {}

  async listDocs(workspaceId: string, repoId: string): Promise<ContextDocListResponse> {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    // The folder-name list comes from config (AC-2): never hard-coded here.
    const folderNames = this.container.config.contextFolderNames;
    const globs = buildContextGlobs(folderNames);

    // Discover all matching paths via the GitClient port.
    // Empty repo or not-yet-cloned repo → [] (AC-3), listFiles never throws.
    const paths = await this.container.git.listFiles(
      { owner: repo.owner, name: repo.name },
      globs,
    );

    return {
      docs: paths.map((path) => ({ path })),
    };
  }
}
