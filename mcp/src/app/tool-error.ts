/**
 * Ring 2 — a domain-level error whose message is already an "error leads
 * forward" instruction for the model (e.g. "… call list_agents to get a valid
 * id"). Tools let it bubble; the response wrapper turns it into an MCP
 * `isError` result verbatim, so the agent gets an actionable next step.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}
