/**
 * User-facing copy for each API {@link ErrorCode}.
 *
 * Single source of truth for the friendly message shown to users. Imported by
 * both server (`http.ts`, when building an `ApiError`) and client
 * (`ErrorBanner`, when rendering a failure). Client-safe: no server imports.
 *
 * Every message is phrased so the matching UI state can offer a retry
 * (architecture.md §6: each error state is retryable).
 */

import type { ErrorCode } from './types';

export const ERROR_COPY: Record<ErrorCode, string> = {
  INVALID_REQUEST: 'Something was wrong with that request. Please try again.',
  INVALID_PROMPT:
    'Please add a business name and description before generating.',
  TIMEOUT: 'The logo generator took too long to respond. Please try again.',
  NO_IMAGE:
    'The AI couldn’t produce a logo for that brief. Try adjusting your details and generate again.',
  UPSTREAM_ERROR:
    'The logo service is having trouble right now. Please try again in a moment.',
  INTERNAL: 'Something went wrong on our end. Please try again.',
};

export function getErrorCopy(code: ErrorCode): string {
  return ERROR_COPY[code] ?? ERROR_COPY.INTERNAL;
}
