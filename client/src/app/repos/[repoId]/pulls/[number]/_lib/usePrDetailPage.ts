/* usePrDetailPage — all orchestration for the PR-detail route, lifted out of
   page.tsx so the page stays a thin layout. Owns: number→uuid resolution, the
   PR / reviews / runs queries, cancel & delete mutations, ?tab / ?trace query
   state, and the invalidation callbacks wired to live-run tracking. The page
   only renders what this returns. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePullDetail, usePulls } from "@/lib/hooks";
import {
  usePrReviews,
  useCancelRun,
  usePrActiveRuns,
  usePrRuns,
  useDeleteRun,
} from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/providers/repo-context";
import { qk } from "@/lib/query-keys";
import { githubPrUrl } from "@/lib/github-urls";
import type { FindingRecord } from "@devdigest/shared";

const DEFAULT_TAB = "overview";
const FINDINGS_TAB = "findings";

export function usePrDetailPage() {
  const params = useParams<{ repoId: string; number: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { repoId, number } = params;

  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);

  const isLoading = pullsLoading || (prId != null && detailLoading);
  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const cancel = useCancelRun();

  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;

  const invalidateActiveRuns = () => {
    if (prId) qc.invalidateQueries({ queryKey: qk.prActiveRuns(prId) });
  };
  // When a run settles (done OR failed) refresh the full run history too, so a
  // just-failed run shows up in "Run history" immediately — no page reload.
  const invalidateRunHistory = () => {
    if (prId) qc.invalidateQueries({ queryKey: qk.prRuns(prId) });
  };

  // ---- ?tab / ?trace query-param state ----
  const tab = search.get("tab") ?? DEFAULT_TAB;
  const traceRunId = search.get("trace");
  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    router.replace(`/repos/${repoId}/pulls/${number}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };
  const setTab = (t: string) => setParam("tab", t);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const allFindings: FindingRecord[] = React.useMemo(
    () => (reviews ?? []).flatMap((r) => r.findings),
    [reviews],
  );
  const lethalTrifecta = allFindings.filter((f) => f.kind === "lethal_trifecta");
  const findingsCount = allFindings.length;

  const repoName = activeRepo?.full_name ?? repoId;
  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: "Pull Requests", href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ];

  const traceRun = runs.find((r) => r.run_id === traceRunId);

  return {
    // identity / chrome
    number,
    prId,
    crumb,
    repoFullName,
    repoNotFound,
    // load state
    isLoading,
    isError,
    error,
    pr,
    // findings / runs
    runs,
    prRuns,
    liveRunIds,
    reviewRunning,
    lethalTrifecta,
    findingsCount,
    // mutations
    cancel,
    // tab / trace state
    tab,
    traceRunId,
    traceFindings: traceRun?.findings ?? [],
    traceAgentName: traceRun?.agent_name ?? null,
    githubUrl: (prNumber: number) => (repoFullName ? githubPrUrl(repoFullName, prNumber) : null),
    // handlers
    setTab,
    retry: () => refetch(),
    onRunStart: () => setTab(FINDINGS_TAB),
    onRunsStarted: () => invalidateActiveRuns(),
    onOpenTrace: (id: string) => setParam("trace", id),
    onCloseTrace: () => setParam("trace", null),
    onDeleteRun: (id: string) => {
      if (window.confirm("Delete this run from history? (its logs are removed too)"))
        deleteRun.mutate(id);
    },
    onRunDone: () => {
      invalidateActiveRuns();
      invalidateRunHistory();
      refetchReviews();
    },
  };
}
