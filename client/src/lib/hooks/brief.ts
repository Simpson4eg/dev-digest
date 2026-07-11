/* hooks/brief.ts — TanStack Query hooks for the Why+Risk Brief.
   Mirrors the useBlastRadius / useIntent pattern in hooks/reviews.ts:
   one useQuery for the brief (POST used as a fetch, no body = use cache),
   one useMutation for regenerate (POST with regenerate:true, then invalidate). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBrief } from "../api";
import { qk } from "../query-keys";
import type { BriefResponse } from "@devdigest/shared";

/** The Why+Risk Brief for a PR. Returns the cached brief if available; the server
 *  decides fresh vs cache — the client just calls POST /pulls/:id/brief with no
 *  body to get the current state (cache hit = zero LLM calls, AC-11/AC-12). */
export function useBrief(prId: string | null | undefined) {
  return useQuery<BriefResponse>({
    queryKey: qk.prBrief(prId),
    queryFn: () => fetchBrief(prId!),
    enabled: !!prId,
  });
}

/** Trigger a fresh brief generation (invalidates the PR's cached brief, AC-13).
 *  After success, replaces the cached query data directly (optimistic update)
 *  AND invalidates so any stale subscriber refetches if needed. */
export function useRegenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchBrief(prId!, { regenerate: true }),
    onSuccess: (data) => {
      // Set the fresh result immediately so the card updates without a round-trip.
      qc.setQueryData(qk.prBrief(prId), data);
    },
    onError: () => {
      // On failure, force a refetch so we at least show the last known state.
      qc.invalidateQueries({ queryKey: qk.prBrief(prId) });
    },
  });
}
