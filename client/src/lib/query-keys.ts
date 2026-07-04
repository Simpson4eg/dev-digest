/* query-keys.ts — single source of truth for TanStack Query keys.

   Centralizing keys here prevents the #1 cache bug called out in
   client/AGENTS.md: a query and its invalidation drifting apart (a literal
   typo'd in one place but not the other). Every key a query or mutation
   touches comes from this factory — never inline a literal `["…"]` array.

   All entries are functions (even the param-less ones) for a uniform call
   site. Keys that act as an invalidation *prefix* (e.g. `providerModels`)
   are documented as such; TanStack matches `invalidateQueries` by prefix. */

export const qk = {
  // ---- core: settings, secrets, repos, pulls, context ----
  settings: () => ["settings"] as const,
  secretsStatus: () => ["secrets-status"] as const,
  repos: () => ["repos"] as const,
  pulls: (repoId: string | null | undefined) => ["pulls", repoId] as const,
  pull: (prId: string | number | null | undefined) => ["pull", prId] as const,
  context: (repoId: string | null | undefined) => ["context", repoId] as const,

  // ---- repo-intel ----
  repoIntelState: (repoId: string | null | undefined) =>
    ["repo-intel-state", repoId] as const,

  // ---- agents ----
  agents: () => ["agents"] as const,
  agent: (id: string | null | undefined) => ["agent", id] as const,
  agentVersions: (id: string | null | undefined) => ["agent-versions", id] as const,
  allAgentSkills: () => ["agent-skills"] as const,
  agentSkills: (id: string | null | undefined) => ["agent-skills", id] as const,
  /** All provider-model lists — use as an invalidation *prefix* (matches every
      `providerModelsFor(provider)` key). */
  providerModels: () => ["provider-models"] as const,
  /** Model list for one provider. Prefixed by `providerModels()`. */
  providerModelsFor: (provider: string | null | undefined) =>
    ["provider-models", provider] as const,

  // ---- skills ----
  skills: () => ["skills"] as const,
  skill: (id: string | null | undefined) => ["skill", id] as const,
  skillVersions: (id: string | null | undefined) => ["skill-versions", id] as const,
  allSkillStats: () => ["skill-stats"] as const,
  skillStats: (id: string | null | undefined) => ["skill-stats", id] as const,

  // ---- reviews / runs ----
  prActiveRuns: (prId: string | null | undefined) => ["pr-active-runs", prId] as const,
  prRuns: (prId: string | null | undefined) => ["pr-runs", prId] as const,
  reviews: (prId: string | null | undefined) => ["reviews", prId] as const,
  prComments: (prId: string | null | undefined) => ["pr-comments", prId] as const,
  /** Intent Layer: derived motivation + scope for a PR (null until derived). */
  prIntent: (prId: string | null | undefined) => ["pr-intent", prId] as const,

  // ---- run trace ----
  runTrace: (runId: string | null | undefined) => ["run-trace", runId] as const,

  // ---- conventions ----
  conventions: (repoId: string | null | undefined) => ["conventions", repoId] as const,
};
