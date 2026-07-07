/**
 * Ring 4 helpers — shape every tool result the same way and centralise the
 * "error leads forward" mapping so no tool hand-rolls it.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError, connectionHint } from '../api/errors.js';
import { ToolError } from '../app/tool-error.js';

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Run a tool body, converting known failures into actionable `isError` results:
 *  - ToolError → its message verbatim (already a next-step instruction),
 *  - a connection ApiError → a "start the server" hint,
 *  - any other ApiError → its status + detail,
 *  - anything unexpected → a generic message (never a raw stack).
 */
export async function runTool(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ToolError) return fail(err.message);
    if (err instanceof ApiError) {
      return fail(err.isConnection ? connectionHint(err) : `DevDigest API error: ${err.message}`);
    }
    return fail(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
