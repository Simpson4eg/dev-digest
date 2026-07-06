import type { Container } from '../../platform/container.js';
import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { composeSmartDiff, type FileInput, type FindingInput } from './compose.js';

/**
 * Smart Diff service — the read-time, ZERO-LLM composition step.
 *
 * Reads two things that already exist: the PR's changed files (`pr_files`) and
 * the findings of the PR's LATEST review. Hands them to the pure
 * `composeSmartDiff`, which classifies each file by path, attaches the lines the
 * reviewer flagged, and orders everything by review risk. No model call, no
 * persistence — this only rearranges the reviewer's existing output.
 */
export class SmartDiffService {
  private repo: ReviewRepository;

  constructor(container: Container) {
    this.repo = new ReviewRepository(container.db);
  }

  async forPull(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files: FileInput[] = (await this.repo.getPrFiles(prId)).map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
    }));

    // Overlay source: the findings of the LATEST review only. `reviewsForPull`
    // returns newest-first; before any review this is empty and the layout
    // still works (files classify + group with no finding overlay).
    const reviews = await this.repo.reviewsForPull(prId);
    const latest = reviews.find((r) => r.review.kind === 'review') ?? reviews[0];
    const findings: FindingInput[] = (latest?.findings ?? []).map((f) => ({
      file: f.file,
      start_line: f.startLine,
      severity: f.severity,
      title: f.title,
    }));

    return composeSmartDiff(files, findings);
  }
}
