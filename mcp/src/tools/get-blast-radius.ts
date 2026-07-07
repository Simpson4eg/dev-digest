import { z } from 'zod';
import type { ToolCtx, ToolDef } from './types.js';
import { fail } from './respond.js';

/**
 * STUB (homework). Registered so clients can see the capability and its future
 * contract, but returns `isError` — never fake success data that would train the
 * model on a response shape we will later change.
 */
export function createGetBlastRadius(_ctx: ToolCtx): ToolDef {
  return {
    name: 'get_blast_radius',
    config: {
      description:
        "[Not yet implemented] Will return a pull request's blast radius — the files and downstream code impacted by its changes. Currently returns an error explaining it is unavailable.",
      inputSchema: {
        repo: z.string().describe('Repository as "owner/name"'),
        pr: z.number().int().positive().describe('Pull request number'),
      },
      annotations: { title: 'Get PR blast radius (stub)', readOnlyHint: true },
    },
    handler: () =>
      Promise.resolve(
        fail(
          'Not yet implemented. get_blast_radius will return the files and downstream code impacted by a pull request. It is not available yet.',
        ),
      ),
  };
}
