/**
 * Ring 2 — translate the flat, human-friendly identifiers the tools accept
 * (`"owner/name"` + PR number) into the internal ids the API addresses by.
 * Depends only on the port; never touches transport types.
 */
import type { DevDigestApi, PrRef, RepoRef } from '../api/port.js';
import { ToolError } from './tool-error.js';

export function parseRepoSlug(slug: string): { owner: string; name: string } {
  const parts = slug.split('/').filter(Boolean);
  if (parts.length !== 2) {
    throw new ToolError(
      `Invalid repo "${slug}". Use the "owner/name" format, e.g. "acme/webapp".`,
    );
  }
  return { owner: parts[0]!, name: parts[1]! };
}

export async function resolveRepo(api: DevDigestApi, slug: string): Promise<RepoRef> {
  const { owner, name } = parseRepoSlug(slug);
  const repos = await api.listRepos();
  const match = repos.find(
    (r) => r.owner.toLowerCase() === owner.toLowerCase() && r.name.toLowerCase() === name.toLowerCase(),
  );
  if (!match) {
    throw new ToolError(
      `Repo "${slug}" is not tracked in DevDigest. Add it there first, or check the owner/name spelling.`,
    );
  }
  return match;
}

export async function resolvePr(api: DevDigestApi, repo: RepoRef, prNumber: number): Promise<PrRef> {
  const pulls = await api.listPulls(repo.id);
  const pr = pulls.find((p) => p.number === prNumber);
  if (!pr) {
    throw new ToolError(
      `PR #${prNumber} was not found in "${repo.owner}/${repo.name}". It may not be imported yet — open it in DevDigest to import it.`,
    );
  }
  return pr;
}

export async function resolvePrBySlug(
  api: DevDigestApi,
  slug: string,
  prNumber: number,
): Promise<{ repo: RepoRef; pr: PrRef }> {
  const repo = await resolveRepo(api, slug);
  const pr = await resolvePr(api, repo, prNumber);
  return { repo, pr };
}
