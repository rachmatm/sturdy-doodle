/**
 * Tiny client-side fetch helper that preserves the API's `{ error, code }`
 * contract (architecture.md §6). Route handlers return a typed error code; this
 * keeps that code on the client so the UI can branch on the *kind* of failure
 * (the three required retryable states) instead of just showing a string.
 *
 * Client-safe: imports only `errorCopy` + `types` (no server-only modules).
 */

import { getErrorCopy } from './errorCopy';
import { isApiError, type ErrorCode } from './types';

/** A failed API call, carrying the typed code alongside the friendly message. */
export class ClientApiError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? getErrorCopy(code));
    this.name = 'ClientApiError';
    this.code = code;
  }
}

/**
 * Perform a JSON request and return the parsed success body, or throw a
 * {@link ClientApiError} carrying the server's code. A network failure (fetch
 * rejects) maps to `UPSTREAM_ERROR`; a non-JSON / malformed success maps to
 * `INTERNAL`. The `fallbackCode` is used when the body isn't a typed ApiError.
 */
export async function requestJson<T>(
  input: string,
  init?: RequestInit,
  fallbackCode: ErrorCode = 'INTERNAL',
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { cache: 'no-store', ...init });
  } catch {
    throw new ClientApiError('UPSTREAM_ERROR');
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok || isApiError(body)) {
    if (isApiError(body)) throw new ClientApiError(body.code, body.error);
    throw new ClientApiError(fallbackCode);
  }

  return body as T;
}
