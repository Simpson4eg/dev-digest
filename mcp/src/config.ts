/**
 * Runtime configuration, read once at the composition root (server.ts) from the
 * environment. No secrets are baked in; the optional API token is a forward seam
 * for when the API stops being local-no-auth.
 *
 * Validation is fail-fast via Zod: a malformed env var (non-numeric timeout,
 * bad URL) ABORTS the start with a readable message rather than silently falling
 * back to a default. Blank/absent vars still fall back to the documented default.
 */
import { z } from 'zod';

export interface Config {
  /** Base URL of the DevDigest API, without a trailing slash. */
  apiUrl: string;
  /** Optional bearer token forwarded to the API. */
  apiToken?: string;
  /** Bounded wait in run_agent_on_pr before the graceful `running` fallback. */
  runTimeoutMs: number;
  /** Poll cadence while waiting for a run to finish. */
  pollIntervalMs: number;
  /** Per-request HTTP timeout for one API call. */
  requestTimeoutMs: number;
}

/** Treat undefined / blank string as "unset" so the schema default applies. */
const blankToUndefined = (v: unknown) =>
  v === undefined || (typeof v === 'string' && v.trim() === '') ? undefined : v;

/** A positive-integer millisecond env var: blank/absent → default, invalid → throw. */
const posIntMs = (fallback: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(fallback));

const ConfigSchema = z.object({
  DEVDIGEST_API_URL: z
    .preprocess(blankToUndefined, z.string().url().default('http://localhost:3001'))
    .transform((u) => u.replace(/\/+$/, '')),
  DEVDIGEST_API_TOKEN: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined),
    z.string().optional(),
  ),
  DEVDIGEST_RUN_TIMEOUT_MS: posIntMs(50_000),
  DEVDIGEST_POLL_INTERVAL_MS: posIntMs(2_000),
  DEVDIGEST_REQUEST_TIMEOUT_MS: posIntMs(15_000),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid DevDigest MCP configuration:\n${issues}`);
  }
  const c = parsed.data;
  return {
    apiUrl: c.DEVDIGEST_API_URL,
    ...(c.DEVDIGEST_API_TOKEN ? { apiToken: c.DEVDIGEST_API_TOKEN } : {}),
    runTimeoutMs: c.DEVDIGEST_RUN_TIMEOUT_MS,
    pollIntervalMs: c.DEVDIGEST_POLL_INTERVAL_MS,
    requestTimeoutMs: c.DEVDIGEST_REQUEST_TIMEOUT_MS,
  };
}
