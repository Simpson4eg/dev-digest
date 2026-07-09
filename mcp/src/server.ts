#!/usr/bin/env node
/**
 * Composition Root (Ring 3/4). The ONLY place that constructs the concrete
 * adapter and injects it inward. stdout carries JSON-RPC, so every log line goes
 * to stderr.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { HttpDevDigestApi } from './api/http-client.js';
import { registerTools } from './tools/index.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new HttpDevDigestApi({
    apiUrl: config.apiUrl,
    ...(config.apiToken ? { apiToken: config.apiToken } : {}),
    requestTimeoutMs: config.requestTimeoutMs,
  });

  const server = new McpServer({ name: 'devdigest', version: '0.1.0' });
  registerTools(server, { api, config });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[devdigest-mcp] ready on stdio → ${config.apiUrl}`);
}

main().catch((err: unknown) => {
  console.error('[devdigest-mcp] fatal:', err);
  process.exit(1);
});
