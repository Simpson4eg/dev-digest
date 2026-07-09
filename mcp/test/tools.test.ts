import { describe, it, expect } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  AgentSummary,
  BlastRadiusDto,
  Convention,
  DevDigestApi,
  PrRef,
  RepoRef,
  ReviewDto,
  RunSummary,
  TriggerReviewResult,
} from '../src/api/port.js';
import type { Config } from '../src/config.js';
import { createListAgents } from '../src/tools/list-agents.js';
import { createRunAgentOnPr } from '../src/tools/run-agent-on-pr.js';
import { createGetFindings } from '../src/tools/get-findings.js';
import { createGetConventions } from '../src/tools/get-conventions.js';
import { createGetBlastRadius } from '../src/tools/get-blast-radius.js';

const CONFIG: Config = {
  apiUrl: 'http://test',
  runTimeoutMs: 1_000,
  pollIntervalMs: 1,
  requestTimeoutMs: 1_000,
};

function body(res: CallToolResult): Record<string, unknown> {
  const first = res.content[0] as { type: string; text: string };
  return JSON.parse(first.text) as Record<string, unknown>;
}

class MockApi implements DevDigestApi {
  agents: AgentSummary[] = [];
  repos: RepoRef[] = [];
  pulls: Record<string, PrRef[]> = {};
  runsByPr: Record<string, RunSummary[]> = {};
  reviews: Record<string, ReviewDto[]> = {};
  conventions: Record<string, Convention[]> = {};
  blastByPr: Record<string, BlastRadiusDto> = {};
  trigger: TriggerReviewResult = { pr_id: '', runs: [] };
  runStatusSeq: string[] = ['done'];
  private getRunCalls = 0;

  async listAgents(): Promise<AgentSummary[]> {
    return this.agents;
  }
  async listRepos(): Promise<RepoRef[]> {
    return this.repos;
  }
  async listPulls(repoId: string): Promise<PrRef[]> {
    return this.pulls[repoId] ?? [];
  }
  async triggerReview(): Promise<TriggerReviewResult> {
    return this.trigger;
  }
  async listRuns(prId: string): Promise<RunSummary[]> {
    return this.runsByPr[prId] ?? [];
  }
  async getRun(runId: string): Promise<RunSummary | null> {
    const i = Math.min(this.getRunCalls, this.runStatusSeq.length - 1);
    const status = this.runStatusSeq[i] ?? 'running';
    this.getRunCalls += 1;
    return {
      run_id: runId,
      agent_id: 'a1',
      agent_name: 'Reviewer',
      status,
      error: status === 'failed' ? 'boom' : null,
      findings_count: null,
      score: null,
      ran_at: null,
    };
  }
  async reviewsForPull(prId: string): Promise<ReviewDto[]> {
    return this.reviews[prId] ?? [];
  }
  async listConventions(repoId: string): Promise<Convention[]> {
    return this.conventions[repoId] ?? [];
  }
  async getBlastRadius(prId: string): Promise<BlastRadiusDto> {
    return (
      this.blastByPr[prId] ?? { changed_symbols: [], downstream: [], summary: '' }
    );
  }
}

function agent(over: Partial<AgentSummary> = {}): AgentSummary {
  return {
    id: 'a1',
    name: 'Reviewer',
    description: 'default',
    provider: 'anthropic',
    model: 'claude',
    enabled: true,
    strategy: 'single-pass',
    ...over,
  };
}

function review(over: Partial<ReviewDto> = {}): ReviewDto {
  return {
    id: 'rv1',
    pr_id: 'p1',
    agent_id: 'a1',
    agent_name: 'Reviewer',
    run_id: 'run1',
    kind: 'review',
    verdict: 'approve',
    summary: 'looks good',
    score: 90,
    created_at: '2026-07-07T00:00:00.000Z',
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded secret',
        file: 'src/a.ts',
        start_line: 3,
        end_line: 3,
        rationale: 'long prose',
        suggestion: 'move to env',
        confidence: 0.9,
      },
      {
        id: 'f2',
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Rename var',
        file: 'src/b.ts',
        start_line: 10,
        end_line: 10,
        rationale: 'long prose',
        confidence: 0.5,
      },
    ],
    ...over,
  };
}

function withRepoAndPr(api: MockApi): void {
  api.repos = [{ id: 'r1', owner: 'acme', name: 'web', full_name: 'acme/web' }];
  api.pulls = { r1: [{ id: 'p1', number: 7, title: 'Add feature' }] };
}

describe('list_agents', () => {
  it('returns a compact summary by default and filters by enabled', async () => {
    const api = new MockApi();
    api.agents = [agent({ id: 'a1', enabled: true }), agent({ id: 'a2', enabled: false })];
    const def = createListAgents({ api, config: CONFIG });

    const all = body(await def.handler({}));
    expect(all.total).toBe(2);
    expect((all.agents as unknown[])[0]).not.toHaveProperty('description');

    const enabled = body(await def.handler({ enabledOnly: true }));
    expect(enabled.total).toBe(1);
  });

  it('includes description and strategy when verbose', async () => {
    const api = new MockApi();
    api.agents = [agent()];
    const def = createListAgents({ api, config: CONFIG });
    const res = body(await def.handler({ verbose: true }));
    expect((res.agents as unknown[])[0]).toHaveProperty('description');
  });
});

describe('run_agent_on_pr', () => {
  it('returns findings when the run finishes in time', async () => {
    const api = new MockApi();
    withRepoAndPr(api);
    api.agents = [agent()];
    api.trigger = { pr_id: 'p1', runs: [{ run_id: 'run1', agent_id: 'a1', agent_name: 'Reviewer' }] };
    api.runStatusSeq = ['done'];
    api.reviews = { p1: [review()] };
    const def = createRunAgentOnPr({ api, config: CONFIG });

    const res = await def.handler({ repo: 'acme/web', pr: 7, agent: 'a1' });
    const out = body(res);
    expect(res.isError).toBeFalsy();
    expect(out.status).toBe('done');
    expect(out.verdict).toBe('approve');
    expect((out.findings_summary as { critical: number }).critical).toBe(1);
  });

  it('errors forward to list_agents on an unknown agent id', async () => {
    const api = new MockApi();
    withRepoAndPr(api);
    api.agents = [agent({ id: 'a1' })];
    const def = createRunAgentOnPr({ api, config: CONFIG });

    const res = await def.handler({ repo: 'acme/web', pr: 7, agent: 'nope' });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain('list_agents');
  });

  it('falls back to {status:running} on timeout', async () => {
    const api = new MockApi();
    withRepoAndPr(api);
    api.agents = [agent()];
    api.trigger = { pr_id: 'p1', runs: [{ run_id: 'run1', agent_id: 'a1', agent_name: 'Reviewer' }] };
    api.runStatusSeq = ['running'];
    const def = createRunAgentOnPr({ api, config: { ...CONFIG, runTimeoutMs: 20, pollIntervalMs: 5 } });

    const out = body(await def.handler({ repo: 'acme/web', pr: 7, agent: 'a1' }));
    expect(out.status).toBe('running');
    expect(out.run_id).toBe('run1');
  });
});

describe('get_findings', () => {
  it('returns a severity breakdown by default', async () => {
    const api = new MockApi();
    withRepoAndPr(api);
    api.reviews = { p1: [review()] };
    const def = createGetFindings({ api, config: CONFIG });

    const out = body(await def.handler({ repo: 'acme/web', pr: 7 }));
    expect(out.runStatus).toBe('done');
    expect((out.findings_summary as { critical: number; suggestion: number })).toEqual({
      critical: 1,
      warning: 0,
      suggestion: 1,
    });
    expect(out).not.toHaveProperty('findings');
  });

  it('returns a paginated list with detail:true and filters by severity', async () => {
    const api = new MockApi();
    withRepoAndPr(api);
    api.reviews = { p1: [review()] };
    const def = createGetFindings({ api, config: CONFIG });

    const out = body(await def.handler({ repo: 'acme/web', pr: 7, detail: true, severity: 'CRITICAL' }));
    expect(out.total).toBe(1);
    expect((out.findings as unknown[]).length).toBe(1);
  });

  it('points to run_agent_on_pr when no review exists', async () => {
    const api = new MockApi();
    withRepoAndPr(api);
    const def = createGetFindings({ api, config: CONFIG });

    const out = body(await def.handler({ repo: 'acme/web', pr: 7 }));
    expect(out.runStatus).toBe('none');
    expect(out.message).toContain('run_agent_on_pr');
  });

  it('errors forward when the repo is not tracked', async () => {
    const api = new MockApi();
    const def = createGetFindings({ api, config: CONFIG });
    const res = await def.handler({ repo: 'no/pe', pr: 1 });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain('not tracked');
  });
});

describe('get_conventions', () => {
  it('summarises by status and category', async () => {
    const api = new MockApi();
    api.repos = [{ id: 'r1', owner: 'acme', name: 'web', full_name: 'acme/web' }];
    api.conventions = {
      r1: [
        { id: 'c1', rule: 'Use kebab-case', category: 'naming', status: 'accepted', confidence: 0.9 },
        { id: 'c2', rule: 'No any', category: 'types', status: 'candidate', confidence: 0.7 },
      ],
    };
    const def = createGetConventions({ api, config: CONFIG });

    const out = body(await def.handler({ repo: 'acme/web' }));
    expect(out.total).toBe(2);
    expect((out.byStatus as Record<string, number>).accepted).toBe(1);
  });

  it('tells the user to extract when empty', async () => {
    const api = new MockApi();
    api.repos = [{ id: 'r1', owner: 'acme', name: 'web', full_name: 'acme/web' }];
    const def = createGetConventions({ api, config: CONFIG });

    const out = body(await def.handler({ repo: 'acme/web' }));
    expect(out.total).toBe(0);
    expect(out.message).toContain('Extract');
  });
});

describe('get_blast_radius', () => {
  it('resolves repo/pr and returns a summary-first impact view with file:line callers', async () => {
    const api = new MockApi();
    withRepoAndPr(api);
    api.blastByPr = {
      p1: {
        changed_symbols: [{ name: 'rateLimit', file: 'src/mw.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [
              { name: 'handler', file: 'src/api/public/index.ts', line: 23 },
              { name: 'hook', file: 'src/api/public/webhooks.ts', line: 45 },
            ],
            endpoints_affected: ['GET /api/public/items'],
            crons_affected: ['reset-rate-buckets'],
          },
        ],
        summary: '',
        prior_prs: [
          {
            pr_number: 468,
            title: 'Load settings from env',
            author: 'darius.n',
            merged_at: '2026-05-21T09:14:00.000Z',
            files_overlap: ['src/config.ts'],
          },
        ],
      },
    };
    const def = createGetBlastRadius({ api, config: CONFIG });

    const res = await def.handler({ repo: 'acme/web', pr: 7 });
    expect(res.isError).toBeFalsy();
    const out = body(res);
    expect(out.counts).toEqual({ changed_symbols: 1, callers: 2, endpoints: 1, crons: 1, prior_prs: 1 });
    const downstream = out.downstream as { symbol: string; callers: string[] }[];
    expect(downstream[0]!.symbol).toBe('rateLimit');
    expect(downstream[0]!.callers).toContain('src/api/public/index.ts:23');
    const priorPrs = out.prior_prs as { pr: number; author: string }[];
    expect(priorPrs).toHaveLength(1);
    expect(priorPrs[0]).toMatchObject({ pr: 468, author: 'darius.n' });
    expect(out).not.toHaveProperty('degraded');
  });

  it('passes the degraded flag + reason through when the index is absent', async () => {
    const api = new MockApi();
    withRepoAndPr(api);
    api.blastByPr = {
      p1: { changed_symbols: [], downstream: [], summary: '', degraded: true, reason: 'no_data' },
    };
    const def = createGetBlastRadius({ api, config: CONFIG });

    const res = await def.handler({ repo: 'acme/web', pr: 7 });
    expect(res.isError).toBeFalsy();
    const out = body(res);
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('no_data');
  });

  it('errors forward to the repo list on an unknown repo', async () => {
    const api = new MockApi();
    const def = createGetBlastRadius({ api, config: CONFIG });
    const res = await def.handler({ repo: 'acme/web', pr: 7 });
    expect(res.isError).toBe(true);
  });
});
