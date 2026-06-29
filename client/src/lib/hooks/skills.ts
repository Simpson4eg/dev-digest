"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Skill, SkillImportPreview, SkillSource, SkillStats, SkillType, SkillVersion } from "@devdigest/shared";
import { api } from "../api";
import { qk } from "../query-keys";

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export function useSkills() {
  return useQuery({ queryKey: qk.skills(), queryFn: () => api.get<Skill[]>("/skills") });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.skill(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.skillVersions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.skillStats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: (skill) => {
      qc.invalidateQueries({ queryKey: qk.skills() });
      qc.setQueryData(qk.skill(skill.id), skill);
    },
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<CreateSkillInput, "source">> }) =>
      api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (skill) => {
      qc.invalidateQueries({ queryKey: qk.skills() });
      qc.invalidateQueries({ queryKey: qk.skillVersions(skill.id) });
      qc.setQueryData(qk.skill(skill.id), skill);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: qk.skills() });
      qc.invalidateQueries({ queryKey: qk.allAgentSkills() });
      qc.removeQueries({ queryKey: qk.skill(id) });
      qc.removeQueries({ queryKey: qk.skillVersions(id) });
      qc.removeQueries({ queryKey: qk.skillStats(id) });
    },
  });
}

export function useSkillImportPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}
