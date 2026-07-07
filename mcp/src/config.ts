/**
 * Runtime configuration, read once at the composition root (server.ts) from the
 * environment. No secrets are baked in; the optional API token is a forward seam
 * for when the API stops being local-no-auth.
 */
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

function intEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.DEVDIGEST_API_TOKEN?.trim();
  return {
    apiUrl: (env.DEVDIGEST_API_URL?.trim() || 'http://localhost:3001').replace(/\/+$/, ''),
    ...(token ? { apiToken: token } : {}),
    runTimeoutMs: intEnv(env.DEVDIGEST_RUN_TIMEOUT_MS, 50_000),
    pollIntervalMs: intEnv(env.DEVDIGEST_POLL_INTERVAL_MS, 2_000),
    requestTimeoutMs: intEnv(env.DEVDIGEST_REQUEST_TIMEOUT_MS, 15_000),
  };
}
