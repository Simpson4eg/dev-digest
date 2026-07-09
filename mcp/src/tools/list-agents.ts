import { z } from 'zod';
import type { ToolCtx, ToolDef } from './types.js';
import { ok, runTool } from './respond.js';
import { agentSummaries } from '../app/shaping.js';

export function createListAgents(ctx: ToolCtx): ToolDef {
  return {
    name: 'list_agents',
    config: {
      description:
        "List the review agents configured in this workspace. Returns each agent's id, name, provider, model, and enabled state. Call this first to get a valid `agent` id for run_agent_on_pr.",
      inputSchema: {
        enabledOnly: z.boolean().optional().describe('Only return enabled agents'),
        verbose: z.boolean().optional().describe('Include description and strategy'),
      },
      annotations: { title: 'List review agents', readOnlyHint: true },
    },
    handler: (args: { enabledOnly?: boolean; verbose?: boolean }) =>
      runTool(async () => {
        const all = await ctx.api.listAgents();
        const filtered = args.enabledOnly ? all.filter((a) => a.enabled) : all;
        return ok({ total: filtered.length, agents: agentSummaries(filtered, args.verbose ?? false) });
      }),
  };
}
