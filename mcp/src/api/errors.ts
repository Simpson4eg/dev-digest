/**
 * Ring 3 — infrastructure errors for the HTTP adapter.
 *
 * `ApiError` carries the HTTP status (or a connection failure). The workflow
 * "error leads forward" wording lives in the tools (Ring 4), which know which
 * tool the model should call next; this layer only supplies the raw fact plus a
 * generic connection hint.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly isConnection = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function connectionHint(err: ApiError): string {
  return (
    `Cannot reach the DevDigest API (${err.message}). ` +
    `Is the server running? Start it with ./scripts/dev.sh, then retry.`
  );
}
