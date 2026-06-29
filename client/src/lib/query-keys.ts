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
  /** All provider-model lists — use as an invalidation *prefix* (matches every
      `providerModelsFor(provider)` key). */
  providerModels: () => ["provider-models"] as const,
  /** Model list for one provider. Prefixed by `providerModels()`. */
  providerModelsFor: (provider: string | null | undefined) =>
    ["provider-models", provider] as const,

  // ---- reviews / runs ----
  prActiveRuns: (prId: string | null | undefined) => ["pr-active-runs", prId] as const,
  prRuns: (prId: string | null | undefined) => ["pr-runs", prId] as const,
  reviews: (prId: string | null | undefined) => ["reviews", prId] as const,
  prComments: (prId: string | null | undefined) => ["pr-comments", prId] as const,

  // ---- run trace ----
  runTrace: (runId: string | null | undefined) => ["run-trace", runId] as const,
};
