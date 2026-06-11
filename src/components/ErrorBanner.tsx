'use client';

import type { ErrorCode } from '@/lib/types';

interface ErrorBannerProps {
  code: ErrorCode;
  /** Friendly message (from the API or error copy). */
  message: string;
  /** Retry the failed action. Omit to hide the retry button. */
  onRetry?: () => void;
  /** Dismiss the banner. Omit to hide the dismiss button. */
  onDismiss?: () => void;
}

/**
 * Retryable failure state (architecture.md §6, PRD §6). Branches on the typed
 * `code` so the three required failure states each read distinctly:
 *  - invalid prompt → fix the brief (validation, no retry of the same input)
 *  - timeout        → the call was slow; retry
 *  - broken / empty → the provider failed; retry
 *
 * The gallery and prior results are never touched by an error, so every state
 * offers a way forward rather than a dead end.
 */

/** Per-code framing: a short heading and whether retrying the same input helps. */
const FRAMING: Record<ErrorCode, { heading: string; retryable: boolean }> = {
  INVALID_REQUEST: { heading: 'Something was off', retryable: true },
  INVALID_PROMPT: { heading: 'Check your brief', retryable: false },
  TIMEOUT: { heading: 'That took too long', retryable: true },
  NO_IMAGE: { heading: 'No logo this time', retryable: true },
  UPSTREAM_ERROR: { heading: 'The logo service had trouble', retryable: true },
  INTERNAL: { heading: 'Something went wrong', retryable: true },
};

export default function ErrorBanner({
  code,
  message,
  onRetry,
  onDismiss,
}: ErrorBannerProps) {
  const { heading, retryable } = FRAMING[code];
  const showRetry = retryable && Boolean(onRetry);

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">
            {heading}
          </p>
          <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded p-1 text-red-500 transition-colors hover:bg-red-100 dark:hover:bg-red-900"
          >
            <span aria-hidden>✕</span>
          </button>
        ) : null}
      </div>

      {showRetry ? (
        <div>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
