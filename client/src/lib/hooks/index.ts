/* hooks/ barrel — every React Query hook over the F1/feature APIs.
   Import from "@/lib/hooks" for the platform hooks (settings/repos/pulls/context)
   or from a domain file directly (e.g. "@/lib/hooks/reviews") — both resolve here. */

// core: settings, secrets, repos, pulls, context
export { useSettings, useUpdateSettings, useTestConnection, useSecretsStatus } from "./core";
export { useRepos, useAddRepo, useRefreshRepo, useDeleteRepo } from "./core";
export { usePulls, usePullDetail, useContextFiles, useReindexContext } from "./core";

// agents
export type { CreateAgentInput, UpdateAgentInput } from "./agents";
export { useAgents, useAgent, useCreateAgent, useUpdateAgent, useDeleteAgent, useProviderModels } from "./agents";

// reviews + SSE
export type { ActiveRun, RunReviewInput, CreateCommentInput } from "./reviews";
export {
  usePrActiveRuns,
  usePrRuns,
  usePrReviews,
  useIntent,
  useDeleteRun,
  useCancelRun,
  useDeleteReview,
  usePrComments,
  useCreatePrComment,
  useRunReview,
  useFindingAction,
  useRunEvents,
} from "./reviews";

// trace
export { useRunTrace } from "./trace";

// repo-intel
export type { RepoIntelState } from "./repo-intel";
export { useRepoIntelStatus, useResyncRepoIntel } from "./repo-intel";
