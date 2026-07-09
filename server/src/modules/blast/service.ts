import type { Container } from '../../platform/container.js';
import type { BlastRadius } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { shapeBlastRadius } from './shape.js';

/**
 * Blast Radius service — the read-time, ZERO-LLM composition step.
 *
 * Reads what already exists: the PR row (for its `repoId`) and the PR's changed
 * files (`pr_files`). Hands the file paths to the repo-intel facade
 * (`getBlastRadius`), which serves the symbol/caller/endpoint graph straight
 * from the persistent index (or a degraded ripgrep best-effort when the repo
 * isn't indexed yet). The pure `shapeBlastRadius` then regroups the facade's
 * flat callers into the wire contract. No model call, no persistence.
 */
export class BlastService {
  private repo: ReviewRepository;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
  }

  async forPull(workspaceId: string, prId: string): Promise<BlastRadius> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const changedFiles = (await this.repo.getPrFiles(prId)).map((f) => f.path);

    // Facade degrades (never throws) when the index is absent — the shaped
    // result then carries `degraded: true` + a reason for the UI badge.
    const result = await this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles);
    const shaped = shapeBlastRadius(result);

    // "Who last touched this code": earlier merged PRs overlapping the changed
    // files. Zero-LLM DB read, independent of the repo-intel index — so it works
    // even on the degraded path. Omitted from the wire when none overlap.
    const priorPrs = await this.repo.getPriorPrs(pull.repoId, prId, changedFiles);
    if (priorPrs.length > 0) {
      shaped.prior_prs = priorPrs.map((p) => ({
        pr_number: p.number,
        title: p.title,
        author: p.author,
        merged_at: p.mergedAt.toISOString(),
        files_overlap: p.filesOverlap,
      }));
    }

    // Anchor click-to-code links to the commit the caller data was indexed at,
    // not the PR head (moved/renamed files would 404 there). Omitted when the
    // repo isn't indexed — the client then falls back to the PR head sha.
    const state = await this.container.repoIntel.getIndexState(pull.repoId);
    return state.lastIndexedSha ? { ...shaped, ref: state.lastIndexedSha } : shaped;
  }
}
