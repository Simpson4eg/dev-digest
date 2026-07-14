/* hooks/project-context.ts — React Query hook for the Project Context
   discovery reader (Task 3 route: GET /repos/:id/context-docs).
   Keys go through qk.contextDocs so queries and invalidations never drift. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { qk } from "../query-keys";
import type { ContextDocListResponse } from "@devdigest/shared";

/**
 * Fetch the list of discovered markdown docs (under specs/docs/insights) for
 * the given repo. Returns { docs: [] } when the repo has no matching folders
 * (AC-3 — empty, not an error).
 */
export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: qk.contextDocs(repoId),
    queryFn: () =>
      api.get<ContextDocListResponse>(`/repos/${repoId}/context-docs`),
    enabled: !!repoId,
  });
}
