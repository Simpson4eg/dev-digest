import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

/** A minimal env with everything unset — exercises the defaults. */
const EMPTY = {} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('falls back to documented defaults when everything is unset', () => {
    const c = loadConfig(EMPTY);
    expect(c.apiUrl).toBe('http://localhost:3001');
    expect(c.apiToken).toBeUndefined();
    expect(c.runTimeoutMs).toBe(50_000);
    expect(c.pollIntervalMs).toBe(2_000);
    expect(c.requestTimeoutMs).toBe(15_000);
  });

  it('treats blank strings as unset (default applies)', () => {
    const c = loadConfig({ DEVDIGEST_RUN_TIMEOUT_MS: '   ', DEVDIGEST_API_URL: '' } as NodeJS.ProcessEnv);
    expect(c.runTimeoutMs).toBe(50_000);
    expect(c.apiUrl).toBe('http://localhost:3001');
  });

  it('parses valid overrides and strips the trailing slash from the URL', () => {
    const c = loadConfig({
      DEVDIGEST_API_URL: 'http://api.internal:3001/',
      DEVDIGEST_API_TOKEN: '  tok  ',
      DEVDIGEST_RUN_TIMEOUT_MS: '30000',
    } as NodeJS.ProcessEnv);
    expect(c.apiUrl).toBe('http://api.internal:3001');
    expect(c.apiToken).toBe('tok');
    expect(c.runTimeoutMs).toBe(30_000);
  });

  it('THROWS (fail-fast) on a non-numeric timeout instead of silently defaulting', () => {
    expect(() => loadConfig({ DEVDIGEST_RUN_TIMEOUT_MS: 'soon' } as NodeJS.ProcessEnv)).toThrow(
      /Invalid DevDigest MCP configuration/,
    );
  });

  it('THROWS on a non-positive / non-integer timeout', () => {
    expect(() => loadConfig({ DEVDIGEST_POLL_INTERVAL_MS: '0' } as NodeJS.ProcessEnv)).toThrow();
    expect(() => loadConfig({ DEVDIGEST_REQUEST_TIMEOUT_MS: '12.5' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('THROWS on a malformed API URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'not-a-url' } as NodeJS.ProcessEnv)).toThrow();
  });
});
