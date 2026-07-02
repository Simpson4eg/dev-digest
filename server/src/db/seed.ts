import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, the three core reviewer agents, and the Test Quality
 * Reviewer with its reusable skills. Agents use the default
 * openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the remaining tables (conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three core presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- test-quality reviewer + reusable skills ----
  // Existing rows are intentionally left untouched: seed must not overwrite a
  // user's edited skill body or reattach a skill they deliberately removed.
  const testQualitySkills = [
    {
      name: 'edge-case-coverage',
      description:
        'Check changed behavior for missing boundary, failure-path, and concurrency coverage.',
      type: 'rubric' as const,
      source: 'manual' as const,
      enabled: true,
      body: `# Edge-case coverage

Compare every changed behavior with the tests in the diff. Check for:

- empty, null, zero, minimum, maximum, and just-outside-boundary inputs;
- pagination boundaries and empty result sets;
- rejected promises, timeouts, retries, and error responses;
- concurrent calls, duplicate events, cleanup, and cancellation where relevant.

Report only a concrete missing case tied to a changed branch or behavior. Do not ask
for exhaustive permutations when one representative boundary proves the contract.`,
    },
    {
      name: 'mock-overuse-gate',
      description:
        'Flag mocks that hide the behavior under test or make assertions pass without exercising real logic.',
      type: 'custom' as const,
      source: 'manual' as const,
      enabled: true,
      body: `# Mock overuse gate

Flag a test when its mocks prevent it from proving the behavior it claims to test:

- the module or function under test is itself mocked;
- every collaborator is mocked, so integration assumptions are never exercised;
- a database or provider mock accepts states that the real dependency rejects;
- the important interaction or resulting state is never asserted;
- spies, fake timers, environment variables, or globals are not restored.

Focused mocks at a real system boundary are valid. Explain the exact behavior hidden
by a mock instead of objecting to mocking in general.`,
    },
    {
      name: 'uncovered-branches',
      description:
        'Map changed control-flow branches to tests and identify meaningful paths with no assertion.',
      type: 'rubric' as const,
      source: 'manual' as const,
      enabled: true,
      body: `# Uncovered branches

Map tests in the diff to changed control flow, including:

- if/else, ternary, and switch alternatives;
- guards and early returns;
- catch blocks, rejected promises, and non-success responses;
- fallback and default behavior.

Do not report a missing branch from filenames or coverage guesses alone. Cite the
exact changed branch and state which input or dependency outcome reaches it.`,
    },
  ];

  const testQualitySkillIds: string[] = [];
  for (const skill of testQualitySkills) {
    const [existing] = await db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, skill.name)));

    if (existing) {
      testQualitySkillIds.push(existing.id);
      continue;
    }

    const createdId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(t.skills)
        .values({ workspaceId, ...skill, version: 1 })
        .returning({ id: t.skills.id });
      await tx
        .insert(t.skillVersions)
        .values({ skillId: created!.id, version: 1, body: skill.body });
      return created!.id;
    });
    testQualitySkillIds.push(createdId);
  }

  const [existingTestQualityAgent] = await db
    .select({ id: t.agents.id })
    .from(t.agents)
    .where(
      and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')),
    );

  if (!existingTestQualityAgent) {
    await db.transaction(async (tx) => {
      const [agent] = await tx
        .insert(t.agents)
        .values({
          workspaceId,
          name: 'Test Quality Reviewer',
          description: 'Reviews PRs for coverage gaps, mock overuse, and flaky test patterns.',
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
          enabled: true,
          version: 1,
          createdBy: userId,
        })
        .returning({ id: t.agents.id });

      await tx.insert(t.agentSkills).values(
        testQualitySkillIds.map((skillId, order) => ({
          agentId: agent!.id,
          skillId,
          order,
        })),
      );
    });
  }

  // ---- api-contract reviewer + 4 convention skills ----
  const apiContractSkills = [
    {
      name: 'breaking-change',
      description:
        'Detect removal or rename of public API routes, fields, or parameters that break existing callers.',
      type: 'convention' as const,
      source: 'manual' as const,
      enabled: true,
      body: `# breaking-change

Flag any change that removes or renames a **public** contract element — endpoint path, method, required parameter, or top-level response field — without a compatibility shim or migration guide.

## Rule

A **breaking change** is any diff that:
- Removes an endpoint (\`DELETE /users/:id\` disappears, no redirect registered)
- Renames an endpoint path segment (\`/v1/orders\` → \`/v1/purchases\`)
- Renames or removes a **required** request parameter or body field
- Removes a **top-level** response field that callers depend on
- Changes a field from optional to required (callers that omit it now fail)

Report as \`CRITICAL\` severity. Cite the exact \`file:line\` where the breaking element was removed or renamed.

## BAD — silently removes a route

\`\`\`diff
- router.get('/users/:id', handler)
\`\`\`

No redirect, no changelog entry → callers receive 404.

## GOOD — route removed with redirect + version note

\`\`\`diff
+ router.get('/users/:id', (req, res) => res.redirect(301, \`/v2/users/\${req.params.id}\`))
- router.get('/users/:id', handler)
\`\`\`

Or: endpoint kept with \`@deprecated\` and removal date documented.

## BAD — field renamed without alias

\`\`\`diff
- { "userId": "abc" }
+ { "user_id": "abc" }
\`\`\`

Callers reading \`response.userId\` get \`undefined\`.

## GOOD — both names present during migration window

\`\`\`json
{ "userId": "abc", "user_id": "abc" }
\`\`\`

Or: only rename accepted after a major version bump with changelog.`,
    },
    {
      name: 'response-schema',
      description:
        'Detect changes to the shape of API responses — field types, nullability, required/optional status.',
      type: 'convention' as const,
      source: 'manual' as const,
      enabled: true,
      body: `# response-schema

Flag any diff that changes the **type, nullability, or presence** of fields in an API response body, including nested objects, arrays, and enums.

## Rule

Report as \`WARNING\` (possibly \`CRITICAL\` for type widening to \`null\`) when the diff:
- Changes a field's type (e.g. \`string\` → \`number\`, \`string\` → \`string | null\`)
- Removes \`required\` from a previously mandatory field (now returns \`undefined\` sometimes)
- Adds a new **required** field to a request body with no default (breaks old callers)
- Changes enum values (adds/removes members that callers may switch on)
- Changes array element shape (callers iterating the array break)

Always cite the Zod/TypeScript schema file and line where the change occurred.

## BAD — field type changed from string to number

\`\`\`diff
 const UserSchema = z.object({
-  age: z.string(),
+  age: z.number(),
 });
\`\`\`

Any caller that called \`.slice()\` or \`.toUpperCase()\` on \`age\` now throws at runtime.

## GOOD — additive field, old type kept

\`\`\`diff
 const UserSchema = z.object({
   age: z.string(),               // kept for compat
+  age_int: z.number().optional(), // new typed field
 });
\`\`\`

Old callers keep working; new callers use \`age_int\`.

## BAD — optional field became nullable without notice

\`\`\`diff
-  email: z.string().optional(),
+  email: z.string().nullable(),
\`\`\`

Callers that called \`email.toUpperCase()\` without a null check now throw.

## GOOD — nullability documented and callers notified

Add a CHANGELOG entry + migration note, bump minor version, and announce the change in the API contract doc.`,
    },
    {
      name: 'semver-discipline',
      description:
        'Enforce correct semver bump decisions — flag breaking changes that ship without a major version bump.',
      type: 'convention' as const,
      source: 'manual' as const,
      enabled: true,
      body: `# semver-discipline

Flag PRs that introduce a breaking API change without bumping the **major** version, or that bump the major version when no breaking change is present.

## Rule

Per [SemVer 2.0.0](https://semver.org/):

| Change type | Required bump |
|-------------|---------------|
| Backwards-incompatible API change | **MAJOR** (X.y.z) |
| New backwards-compatible functionality | MINOR (x.Y.z) |
| Backwards-compatible bug fix | PATCH (x.y.Z) |

Report as \`CRITICAL\` when:
- A breaking change (removed/renamed route, field type change) is present **and** \`package.json\` version was not bumped to the next major.
- A major bump is present **without** any breaking change (indicates incorrect release discipline).

Cite both the breaking-change line and the \`package.json:version\` line.

## BAD — breaking change, only patch bump

\`\`\`diff
// routes/users.ts
-router.delete('/users/:id', handler)

// package.json
-"version": "2.3.1"
+"version": "2.3.2"
\`\`\`

Removing a route is a breaking change → must be \`3.0.0\`.

## GOOD — breaking change with major bump

\`\`\`diff
// routes/users.ts
-router.delete('/users/:id', handler)

// package.json
-"version": "2.3.1"
+"version": "3.0.0"
\`\`\`

Plus CHANGELOG entry and migration guide.

## BAD — unnecessary major bump

\`\`\`diff
// adds a new optional field — backwards compatible
+"version": "3.0.0"
\`\`\`

New optional field is a MINOR change → use \`2.4.0\`.`,
    },
    {
      name: 'deprecation-policy',
      description:
        'Ensure deprecated endpoints/fields are marked and not silently removed; enforce the notice → sunset → removal lifecycle.',
      type: 'convention' as const,
      source: 'manual' as const,
      enabled: true,
      body: `# deprecation-policy

Flag any change that **silently removes or disables** a public API element that was in use, without prior deprecation notice.

## Rule

Public API elements (routes, fields, parameters, enums) must follow a three-step lifecycle before removal:

1. **Deprecation notice** — add \`@deprecated\` annotation, HTTP header \`Deprecation: true\` / \`Sunset: <date>\`, or a \`deprecated: true\` field in the OpenAPI spec.
2. **Sunset period** — the element continues to work for a defined period (e.g. one major version or 90 days).
3. **Removal** — only after the sunset date has passed and callers have been notified.

Report as \`CRITICAL\` when an element is removed without step 1 having occurred in a previous release. Report as \`WARNING\` when step 1 is present but step 2 (sunset date) is missing.

## BAD — silent removal with no prior deprecation

\`\`\`diff
-router.get('/v1/legacy-search', legacySearchHandler)
\`\`\`

No \`@deprecated\` comment, no Deprecation header, no CHANGELOG entry → callers receive unexpected 404.

## GOOD — staged deprecation

\`\`\`ts
// v2.1.0 — deprecation notice added
router.get('/v1/legacy-search', (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Jan 2026 00:00:00 GMT');
  return legacySearchHandler(req, res, next);
});
\`\`\`

\`\`\`diff
// v3.0.0 — removed after sunset date
-router.get('/v1/legacy-search', ...)
\`\`\`

CHANGELOG entry references the v2.1.0 deprecation announcement.

## BAD — deprecated field removed in same PR as deprecation

\`\`\`diff
+/** @deprecated use \`user_id\` instead */
-userId?: string;
\`\`\`

Deprecation and removal must be in **separate releases**.

## GOOD — two-release cycle

Release N: add \`@deprecated\` annotation, keep field working.
Release N+1: remove field after consumers have migrated.`,
    },
  ];

  const apiContractSkillIds: string[] = [];
  for (const skill of apiContractSkills) {
    const [existing] = await db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, skill.name)));

    if (existing) {
      apiContractSkillIds.push(existing.id);
      continue;
    }

    const createdId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(t.skills)
        .values({ workspaceId, ...skill, version: 1 })
        .returning({ id: t.skills.id });
      await tx
        .insert(t.skillVersions)
        .values({ skillId: created!.id, version: 1, body: skill.body });
      return created!.id;
    });
    apiContractSkillIds.push(createdId);
  }

  const [existingApiContractAgent] = await db
    .select({ id: t.agents.id })
    .from(t.agents)
    .where(
      and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'API Contract Reviewer')),
    );

  if (!existingApiContractAgent) {
    await db.transaction(async (tx) => {
      const [agent] = await tx
        .insert(t.agents)
        .values({
          workspaceId,
          name: 'API Contract Reviewer',
          description:
            'Guards API contracts: flags breaking changes, schema violations, semver errors, and missing deprecation notices.',
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
          enabled: true,
          version: 1,
          createdBy: userId,
        })
        .returning({ id: t.agents.id });

      await tx.insert(t.agentSkills).values(
        apiContractSkillIds.map((skillId, order) => ({
          agentId: agent!.id,
          skillId,
          order,
        })),
      );
    });
  }

  return { workspaceId, userId };
}

// CLI entrypoint
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
