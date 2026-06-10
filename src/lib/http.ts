/**
 * Server-side helpers for uniform API responses.
 *
 * Every route handler returns either a success payload or the uniform
 * `{ error, code }` shape (architecture.md §6). This module owns the
 * code → HTTP status mapping and the JSON builders so individual routes never
 * hand-roll a response. Rich detail is logged here; only the friendly message
 * defined in `errorCopy.ts` ever reaches the client.
 *
 * Server-only (imports `next/server`); do not import from client components.
 */

import { NextResponse } from 'next/server';
import type { ApiError, ErrorCode } from './types';
import { getErrorCopy } from './errorCopy';

/** HTTP status for each error code (architecture.md §6). */
const ERROR_STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_PROMPT: 400,
  TIMEOUT: 504,
  NO_IMAGE: 502,
  UPSTREAM_ERROR: 502,
  INTERNAL: 500,
};

/**
 * A typed failure that route handlers (or the libs they call) can throw and
 * have converted into a uniform error response by {@link toErrorResponse}.
 * `cause` carries server-side detail for logging and is never sent to clients.
 */
export class ApiException extends Error {
  readonly code: ErrorCode;
  /**
   * Client-safe override for the user-facing message. When unset, the friendly
   * `errorCopy` for the code is shown. `message` (the Error message) is for
   * server logs only and is never sent to the client.
   */
  readonly publicMessage?: string;

  constructor(
    code: ErrorCode,
    options?: { message?: string; publicMessage?: string; cause?: unknown },
  ) {
    super(options?.message ?? code, { cause: options?.cause });
    this.name = 'ApiException';
    this.code = code;
    this.publicMessage = options?.publicMessage;
  }
}

/** Build a success JSON response. */
export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

/**
 * Build a uniform error response. `messageOverride` replaces the default
 * user-facing copy when a route needs to be more specific (e.g. a validation
 * message); it is still client-safe text, never leaked internals.
 */
export function jsonError(
  code: ErrorCode,
  messageOverride?: string,
): NextResponse<ApiError> {
  const body: ApiError = { code, error: messageOverride ?? getErrorCopy(code) };
  return NextResponse.json(body, { status: ERROR_STATUS[code] });
}

/**
 * Convert any thrown value into a uniform error response, logging detail
 * server-side. Use in a route's `catch`:
 *
 *   try { ... } catch (err) { return toErrorResponse(err); }
 */
export function toErrorResponse(err: unknown): NextResponse<ApiError> {
  if (err instanceof ApiException) {
    console.error(`[api] ${err.code}:`, err.message, err.cause ?? '');
    // Only a deliberately-set publicMessage reaches the client; diagnostic
    // detail in `message` stays in the logs.
    return jsonError(err.code, err.publicMessage);
  }
  console.error('[api] INTERNAL:', err);
  return jsonError('INTERNAL');
}

/** Parse a request's JSON body, throwing INVALID_REQUEST on malformed input. */
export async function parseJsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch (cause) {
    throw new ApiException('INVALID_REQUEST', { cause });
  }
}
