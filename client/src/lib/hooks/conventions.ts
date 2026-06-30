"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConventionCandidate,
  ConventionStatus,
  CreateConventionSkillBody,
  Skill,
} from "@devdigest/shared";
import { api } from "../api";
import { qk } from "../query-keys";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: qk.conventions(repoId),
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ repo_id: string; candidates: ConventionCandidate[] }>(
        `/repos/${repoId}/conventions/extract`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.conventions(repoId) });
    },
  });
}

export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { status?: ConventionStatus; rule?: string; category?: string };
    }) => api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.conventions(repoId) });
    },
  });
}

export function useCreateConventionSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateConventionSkillBody) =>
      api.post<Skill>("/conventions/skill", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
