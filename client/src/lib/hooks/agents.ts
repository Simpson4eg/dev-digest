/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { qk } from "../query-keys";
import type { Agent, AgentContextDocsResponse, AgentContextDocsSetRequest, AgentSkillLink, AgentVersion, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";

export function useAgents() {
  return useQuery({
    queryKey: qk.agents(),
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.agent(id),
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export function useAgentVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.agentVersions(id),
    queryFn: () => api.get<AgentVersion[]>(`/agents/${id}/versions`),
    enabled: !!id,
  });
}

export function useAgentSkills(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.agentSkills(id),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${id}/skills`),
    enabled: !!id,
  });
}

export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, skillIds }: { id: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${id}/skills`, { skill_ids: skillIds }),
    onSuccess: (links, { id }) => {
      qc.setQueryData(qk.agentSkills(id), links);
      qc.invalidateQueries({ queryKey: qk.agent(id) });
      qc.invalidateQueries({ queryKey: qk.agents() });
      qc.invalidateQueries({ queryKey: qk.allSkillStats() });
    },
    onError: (_error, { id }) => qc.invalidateQueries({ queryKey: qk.agentSkills(id) }),
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.agents() }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.agents() });
      qc.invalidateQueries({ queryKey: qk.allSkillStats() });
      qc.invalidateQueries({ queryKey: qk.agentVersions(data.id) });
      qc.setQueryData(qk.agent(data.id), data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: qk.agents() });
      qc.invalidateQueries({ queryKey: qk.allSkillStats() });
      qc.removeQueries({ queryKey: qk.agent(id) });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: qk.providerModelsFor(provider),
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Agent context-docs attachment (Task 7 — AC-4, AC-6)
// ---------------------------------------------------------------------------

/**
 * Fetch the ordered list of context-doc paths currently attached to an agent.
 * Returns { paths: [] } when none are attached (never an error).
 */
export function useAgentContextDocs(agentId: string | null | undefined) {
  return useQuery({
    queryKey: qk.agentContextDocs(agentId),
    queryFn: () => api.get<AgentContextDocsResponse>(`/agents/${agentId}/context-docs`),
    enabled: !!agentId,
  });
}

/**
 * Full-replace the agent's ordered attachment list (PUT /agents/:id/context-docs).
 * Mirrors the setSkills pattern: supply the full ordered array; the server persists
 * and returns the new list. Invalidates the agentContextDocs key on success.
 */
export function useSetAgentContextDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paths }: { id: string; paths: string[] }) => {
      const body: AgentContextDocsSetRequest = { paths };
      return api.put<AgentContextDocsResponse>(`/agents/${id}/context-docs`, body);
    },
    onSuccess: (data, { id }) => {
      qc.setQueryData(qk.agentContextDocs(id), data);
    },
    onError: (_err, { id }) => {
      void qc.invalidateQueries({ queryKey: qk.agentContextDocs(id) });
    },
  });
}
