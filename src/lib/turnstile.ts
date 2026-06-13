/**
 * Cloudflare Turnstile server-side verification (bot protection).
 *
 * Server-only: reads the secret key from the environment and never exposes it.
 * The companion browser widget mints a one-time token (`src/components/
 * TurnstileWidget.tsx`); the protected routes (`/api/generate`, `/api/refine`)
 * pass that token here before doing any AI work.
 *
 * Enforcement is **opt-in**: it is active only when `TURNSTILE_SECRET_KEY` is
 * set. With the secret unset, verification is skipped (with a one-time warning)
 * so local dev and key-less deploys keep working — protection switches on the
 * moment the secret is configured. This mirrors the codebase's other graceful
 * env toggles (`IMAGE_PROVIDER`, `IMAGE_KEY_STRATEGY`, Turso/Blob auto-select).
 */

import { ApiException } from './http';

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Siteverify is a fast call; cap it so a hung upstream can't stall a request.
const VERIFY_TIMEOUT_MS = 10_000;

/** Cloudflare's siteverify response (only the fields we use). */
interface SiteVerifyResult {
  success: boolean;
  'error-codes'?: string[];
}

/** Whether Turnstile verification is enforced (i.e. a secret key is configured). */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

// Warn at most once per process so a key-less deploy isn't noisy on every call.
let warnedDisabled = false;

/**
 * Verify a Turnstile token, throwing a typed {@link ApiException} on failure:
 *  - missing/blank token (when enforced) → `INVALID_REQUEST` (retryable banner)
 *  - Cloudflare reports `success:false`  → `INVALID_REQUEST`
 *  - network/timeout reaching Cloudflare → `UPSTREAM_ERROR`
 *
 * Resolves (no-op) when `TURNSTILE_SECRET_KEY` is unset.
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp?: string,
): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (!warnedDisabled) {
      console.warn(
        '[turnstile] TURNSTILE_SECRET_KEY is not set — bot verification is disabled.',
      );
      warnedDisabled = true;
    }
    return;
  }

  const trimmed = token?.trim();
  if (!trimmed) {
    throw new ApiException('INVALID_REQUEST', {
      message: 'turnstile: missing token',
      publicMessage: 'Please complete the bot check and try again.',
    });
  }

  const body = new URLSearchParams({ secret, response: trimmed });
  if (remoteIp) body.set('remoteip', remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  let result: SiteVerifyResult;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    result = (await res.json()) as SiteVerifyResult;
  } catch (cause) {
    // Abort (timeout) or network error — the provider was unreachable, not the
    // user failing the check; surface a retryable upstream error.
    throw new ApiException('UPSTREAM_ERROR', {
      message: 'turnstile: siteverify request failed',
      cause,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!result.success) {
    throw new ApiException('INVALID_REQUEST', {
      message: `turnstile: verification failed (${result['error-codes']?.join(',') ?? 'unknown'})`,
      publicMessage: 'Bot check failed. Please try again.',
    });
  }
}

/**
 * Best-effort client IP for the optional `remoteip` siteverify field, read from
 * the `x-forwarded-for` header (first hop) set by hosts/proxies. Returns
 * `undefined` when absent; siteverify treats `remoteip` as optional.
 */
export function clientIp(req: Request): string | undefined {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
}
