import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolCtx } from './types.js';
import { createListAgents } from './list-agents.js';
import { createRunAgentOnPr } from './run-agent-on-pr.js';
import { createGetFindings } from './get-findings.js';
import { createGetConventions } from './get-conventions.js';
import { createGetBlastRadius } from './get-blast-radius.js';

/** Wire all five tools into the server. Called once from the composition root. */
export function registerTools(server: McpServer, ctx: ToolCtx): void {
  const defs = [
    createListAgents(ctx),
    createRunAgentOnPr(ctx),
    createGetFindings(ctx),
    createGetConventions(ctx),
    createGetBlastRadius(ctx),
  ];
  for (const def of defs) {
    server.registerTool(def.name, def.config, def.handler);
  }
}
