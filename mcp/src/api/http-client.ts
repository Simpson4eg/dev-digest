/**
 * Ring 3 — the only implementation of the `DevDigestApi` port. A thin, typed
 * fetch wrapper over the DevDigest Fastify API. No auth header is required in the
 * local no-auth MVP; a bearer token is forwarded when configured (forward seam).
 */
import type {
  AgentSummary,
  Convention,
  DevDigestApi,
  PrRef,
  RepoRef,
  ReviewDto,
  RunSummary,
  TriggerReviewResult,
} from './port.js';
import { ApiError } from './errors.js';

export interface HttpClientOptions {
  apiUrl: string;
  apiToken?: string;
  requestTimeoutMs?: number;
}

export class HttpDevDigestApi implements DevDigestApi {
  constructor(private readonly opts: HttpClientOptions) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.opts.apiUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(this.opts.apiToken ? { authorization: `Bearer ${this.opts.apiToken}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new ApiError(`${method} ${url}: ${reason}`, null, true);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ApiError(`${method} ${path} → ${res.status} ${detail.slice(0, 200)}`, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  listAgents(): Promise<AgentSummary[]> {
    return this.request<AgentSummary[]>('GET', '/agents');
  }

  listRepos(): Promise<RepoRef[]> {
    return this.request<RepoRef[]>('GET', '/repos');
  }

  listPulls(repoId: string): Promise<PrRef[]> {
    return this.request<PrRef[]>('GET', `/repos/${repoId}/pulls`);
  }

  triggerReview(prId: string, agentId: string): Promise<TriggerReviewResult> {
    return this.request<TriggerReviewResult>('POST', `/pulls/${prId}/review`, { agentId });
  }

  listRuns(prId: string): Promise<RunSummary[]> {
    return this.request<RunSummary[]>('GET', `/pulls/${prId}/runs`);
  }

  async getRun(runId: string): Promise<RunSummary | null> {
    try {
      return await this.request<RunSummary>('GET', `/runs/${runId}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  reviewsForPull(prId: string): Promise<ReviewDto[]> {
    return this.request<ReviewDto[]>('GET', `/pulls/${prId}/reviews`);
  }

  listConventions(repoId: string): Promise<Convention[]> {
    return this.request<Convention[]>('GET', `/repos/${repoId}/conventions`);
  }
}
