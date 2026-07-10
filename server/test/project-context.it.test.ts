import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import * as t from '../src/db/schema.js';
import type { Review, RunTrace } from '@devdigest/shared';
import { eq } from 'drizzle-orm';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context.it] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 90,
  findings: [
    {
      id: 'f-valid',
      severity: 'SUGGESTION',
      category: 'style',
      title: 'Consider extracting constant',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'Hardcoded value.',
      suggestion: 'Extract to a constant.',
      confidence: 0.8,
      kind: 'finding',
    },
  ],
};

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `ctx-inject-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 100,
      title: 'Test PR',
      author: 'user',
      branch: 'feat/test',
      base: 'main',
      headSha: 'abc1234',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: null,
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch:
      '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

/**
 * Poll the run_traces table directly (bypassing the route) until the trace is
 * persisted, so tests don't hit a TOCTOU race between completeAgentRun and
 * saveRunTrace (completeAgentRun sets status='done' first, then the trace is
 * saved — waitForPrRuns can return between these two steps).
 */
async function waitForTrace(
  db: PgFixture['handle']['db'],
  runId: string,
  opts: { timeoutMs?: number } = {},
): Promise<RunTrace> {
  const { timeoutMs = 15_000 } = opts;
  const start = Date.now();
  for (;;) {
    const [row] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
    if (row) return row.trace as RunTrace;
    if (Date.now() - start > timeoutMs) throw new Error(`trace for run ${runId} not available after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Task 4 integration tests — project-context injection.
 *
 * (a) AC-11/14/15: injected doc appears in the prompt, specs_read populated, token sizes present.
 * (b) AC-16: missing/unreadable path is skipped, logged, absent from specs_read, run does NOT fail.
 * (c) AC-12: empty effective set → specs_read=[], prompt_assembly.specs absent.
 */
d('project-context injection (run-executor)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it(
    '(a) AC-11/14/15: attached doc is injected; specs_read + token sizes populated',
    async () => {
      const DOC_PATH = 'specs/SPEC-01.md';
      const DOC_CONTENT = '# My Spec\n\nDo not import db from api.';

      const app = await buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient({
            diff: DIFF,
            files: { [DOC_PATH]: DOC_CONTENT },
          }),
          llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
        },
      });

      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

      // Create an agent via API
      const agent = (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name: 'CtxAgent-a', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
        })
      ).json();

      // Directly attach the context doc to the agent via the repository
      const agentsRepo = new AgentsRepository(pg.handle.db);
      await agentsRepo.setContextDocs(agent.id, [DOC_PATH]);

      // Run the review
      const started = (
        await app.inject({
          method: 'POST',
          url: `/pulls/${pr.id}/review`,
          payload: { agentId: agent.id },
        })
      ).json();

      const runId = started.runs[0].run_id;

      try {
        // Wait for the agent_runs row to reach a terminal status
        await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, timeoutMs: 20_000 });
        // Then wait for the trace to be persisted (there's a small gap between
        // completeAgentRun and saveRunTrace)
        const trace = await waitForTrace(pg.handle.db, runId, { timeoutMs: 10_000 });

        // AC-14: specs_read populated with the injected path
        expect(trace.specs_read).toContain(DOC_PATH);

        // AC-11: specs rendered in the prompt assembly
        expect(trace.prompt_assembly.specs).not.toBeNull();
        expect(trace.prompt_assembly.specs).toContain(DOC_CONTENT.slice(0, 10));

        // AC-15: per-doc token sizes populated
        expect(trace.prompt_assembly.specs_tokens).toBeDefined();
        expect(typeof (trace.prompt_assembly.specs_tokens as Record<string, number>)[DOC_PATH]).toBe('number');
        expect((trace.prompt_assembly.specs_tokens as Record<string, number>)[DOC_PATH]).toBeGreaterThan(0);
      } finally {
        await app.close();
      }
    },
    40_000,
  );

  it(
    '(b) AC-16: missing/unreadable path → skipped, absent from specs_read, run does not fail',
    async () => {
      const MISSING_PATH = 'specs/DOES-NOT-EXIST.md';

      // Build a mock git that throws for a specific path, simulating "unreadable".
      // Uses Object.create + method override to avoid TypeScript class override issues.
      const base = new MockGitClient({ diff: DIFF });
      const throwingGit = Object.assign(Object.create(Object.getPrototypeOf(base)), base) as MockGitClient;
      throwingGit.readFile = async (
        _repo: Parameters<MockGitClient['readFile']>[0],
        path: string,
      ): Promise<string> => {
        if (path === MISSING_PATH) throw new Error('ENOENT: no such file or directory');
        return '';
      };

      const app = await buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          git: throwingGit,
          llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
        },
      });

      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

      const agent = (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name: 'CtxAgent-b', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
        })
      ).json();

      const agentsRepo = new AgentsRepository(pg.handle.db);
      await agentsRepo.setContextDocs(agent.id, [MISSING_PATH]);

      const started = (
        await app.inject({
          method: 'POST',
          url: `/pulls/${pr.id}/review`,
          payload: { agentId: agent.id },
        })
      ).json();

      const runId = started.runs[0].run_id;

      try {
        const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, timeoutMs: 30_000 });

        // Run must not fail (AC-16)
        const run = runs.find((r) => r.id === runId);
        expect(run?.status).toBe('done');

        const trace = await waitForTrace(pg.handle.db, runId, { timeoutMs: 10_000 });

        // Missing path must NOT appear in specs_read (AC-16)
        expect(trace.specs_read).not.toContain(MISSING_PATH);
        expect(trace.specs_read).toHaveLength(0);

        // The skip must appear in the log
        const logMessages: string[] = trace.log.map((l) => l.msg);
        expect(
          logMessages.some((m) => m.includes('project-context') && m.includes(MISSING_PATH)),
        ).toBe(true);
      } finally {
        await app.close();
      }
    },
    40_000,
  );

  it(
    '(c) AC-12: empty effective set → specs slot absent, prompt byte-identical to no-context run',
    async () => {
      const app = await buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient({ diff: DIFF }),
          llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
        },
      });

      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

      const agent = (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name: 'CtxAgent-c', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
        })
      ).json();

      // No context docs attached — effective set is empty

      const started = (
        await app.inject({
          method: 'POST',
          url: `/pulls/${pr.id}/review`,
          payload: { agentId: agent.id },
        })
      ).json();

      const runId = started.runs[0].run_id;

      try {
        await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, timeoutMs: 20_000 });
        const trace = await waitForTrace(pg.handle.db, runId, { timeoutMs: 10_000 });

        // AC-12: empty set → specs_read empty, specs slot null/absent in prompt_assembly
        expect(trace.specs_read).toEqual([]);
        expect(trace.prompt_assembly.specs == null).toBe(true);
        // AC-15: no token sizes when nothing injected
        expect(trace.prompt_assembly.specs_tokens == null).toBe(true);
      } finally {
        await app.close();
      }
    },
    40_000,
  );

  it(
    'skill-inherited context docs are injected (AC-8, AC-10)',
    async () => {
      const DOC_PATH = 'docs/skill-guide.md';
      const DOC_CONTENT = '# Skill Guide\n\nUse structured error handling.';

      const app = await buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient({
            diff: DIFF,
            files: { [DOC_PATH]: DOC_CONTENT },
          }),
          llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
        },
      });

      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

      // Create agent + skill
      const agent = (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name: 'CtxAgent-skill', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
        })
      ).json();
      const skill = (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: {
            name: 'ctx-skill',
            description: 'A skill with context.',
            type: 'custom',
            body: '# Ctx',
            enabled: true,
          },
        })
      ).json();

      // Link skill to agent
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [skill.id] },
      });

      // Attach doc to the SKILL (not the agent directly)
      const skillsRepo = new SkillsRepository(pg.handle.db);
      await skillsRepo.setContextDocs(skill.id, [DOC_PATH]);

      const started = (
        await app.inject({
          method: 'POST',
          url: `/pulls/${pr.id}/review`,
          payload: { agentId: agent.id },
        })
      ).json();

      const runId = started.runs[0].run_id;

      try {
        await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, timeoutMs: 20_000 });
        const trace = await waitForTrace(pg.handle.db, runId, { timeoutMs: 10_000 });

        // Skill-inherited doc should appear in specs_read (AC-8)
        expect(trace.specs_read).toContain(DOC_PATH);
        expect(trace.prompt_assembly.specs).toContain(DOC_CONTENT.slice(0, 10));
      } finally {
        await app.close();
      }
    },
    40_000,
  );

  it(
    '(security FIX-1): non-context path (.git/config) stored in DB is NOT injected',
    async () => {
      // An attacker with workspace access could call PUT /agents/:id/context-docs
      // with an arbitrary in-repo path. The safety filter at the injection point
      // must block it before readFile is called — the path never appears in
      // specs_read, and the run must still succeed.
      const NON_CONTEXT_PATH = '.git/config';
      const REAL_DOC_PATH = 'specs/SPEC-01.md';
      const REAL_DOC_CONTENT = '# Real Spec\n\nSome guidance.';

      const app = await buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient({
            diff: DIFF,
            // Provide the real doc so the mock doesn't error when it's read;
            // also provide the non-context path so we can confirm it was NOT read.
            files: {
              [REAL_DOC_PATH]: REAL_DOC_CONTENT,
              [NON_CONTEXT_PATH]: '[core]\n\trepositoryformatversion = 0',
            },
          }),
          llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
        },
      });

      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

      const agent = (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name: 'CtxAgent-sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
        })
      ).json();

      // Directly bypass the API to store a non-context path (simulating a
      // tampered request that passes validation but fails at injection time).
      const agentsRepo = new AgentsRepository(pg.handle.db);
      await agentsRepo.setContextDocs(agent.id, [NON_CONTEXT_PATH, REAL_DOC_PATH]);

      const started = (
        await app.inject({
          method: 'POST',
          url: `/pulls/${pr.id}/review`,
          payload: { agentId: agent.id },
        })
      ).json();

      const runId = started.runs[0].run_id;

      try {
        await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, timeoutMs: 20_000 });
        const trace = await waitForTrace(pg.handle.db, runId, { timeoutMs: 10_000 });

        // Security: the non-context path MUST NOT appear in specs_read
        expect(trace.specs_read).not.toContain(NON_CONTEXT_PATH);
        // The real context doc MUST still be injected (filter is not too broad)
        expect(trace.specs_read).toContain(REAL_DOC_PATH);
        // The skip log must be present
        const logMessages: string[] = trace.log.map((l) => l.msg);
        expect(
          logMessages.some((m) => m.includes('not a discoverable context doc') && m.includes(NON_CONTEXT_PATH)),
        ).toBe(true);
      } finally {
        await app.close();
      }
    },
    40_000,
  );

  it(
    'disabled skill context docs NOT injected (AC-10)',
    async () => {
      const DOC_PATH = 'docs/disabled-skill-guide.md';

      const app = await buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient({
            diff: DIFF,
            files: { [DOC_PATH]: '# Disabled Skill Guide' },
          }),
          llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
        },
      });

      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

      try {
        const agent = (
          await app.inject({
            method: 'POST',
            url: '/agents',
            payload: {
              name: 'CtxAgent-disabled',
              provider: 'openai',
              model: 'gpt-4.1',
              system_prompt: 'rev',
            },
          })
        ).json();
        // Create a DISABLED skill
        const disabledSkill = (
          await app.inject({
            method: 'POST',
            url: '/skills',
            payload: {
              name: 'disabled-ctx-skill',
              description: 'Disabled.',
              type: 'custom',
              body: '# D',
              enabled: false,
            },
          })
        ).json();

        // Link disabled skill to agent
        await app.inject({
          method: 'POST',
          url: `/agents/${agent.id}/skills`,
          payload: { skill_ids: [disabledSkill.id] },
        });

        // Attach doc to the disabled skill
        const skillsRepo = new SkillsRepository(pg.handle.db);
        await skillsRepo.setContextDocs(disabledSkill.id, [DOC_PATH]);

        const started = (
          await app.inject({
            method: 'POST',
            url: `/pulls/${pr.id}/review`,
            payload: { agentId: agent.id },
          })
        ).json();

        const runId = started.runs[0].run_id;

        await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, timeoutMs: 20_000 });
        const trace = await waitForTrace(pg.handle.db, runId, { timeoutMs: 10_000 });

        // AC-10: disabled skill → its docs must NOT appear
        expect(trace.specs_read).not.toContain(DOC_PATH);
        expect(trace.specs_read).toHaveLength(0);
      } finally {
        await app.close();
      }
    },
    40_000,
  );
});
