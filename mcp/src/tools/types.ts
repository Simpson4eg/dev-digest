import type { ZodRawShape } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../config.js';
import type { DevDigestApi } from '../api/port.js';

/** Injected dependencies every tool receives (the port + config). */
export interface ToolCtx {
  api: DevDigestApi;
  config: Config;
}

/**
 * A self-contained tool definition. Kept separate from registration so tests can
 * call `def.handler(args)` directly. Args are validated by the SDK against
 * `inputSchema` before the handler runs.
 */
export interface ToolDef {
  name: string;
  config: {
    description: string;
    inputSchema: ZodRawShape;
    annotations?: { title?: string; readOnlyHint?: boolean };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<CallToolResult>;
}
