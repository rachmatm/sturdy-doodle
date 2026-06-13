/**
 * Unit tests for the Cloudflare Turnstile verification in `turnstile.ts`.
 *
 * Like `ai.test.ts`, the logic (opt-in enforcement + siteverify outcome → typed
 * error) is exercised against a mocked `fetch` — no real Cloudflare calls. Each
 * test sets only the env it needs; `turnstile.ts` reads `process.env` at call
 * time, so no module reset is required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp, isTurnstileEnabled, verifyTurnstile } from './turnstile';
import { ApiException } from './http';

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TURNSTILE_SECRET_KEY;
});

describe('isTurnstileEnabled', () => {
  it('is false when the secret is unset', () => {
    expect(isTurnstileEnabled()).toBe(false);
  });

  it('is true once the secret is set', () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    expect(isTurnstileEnabled()).toBe(true);
  });
});

describe('verifyTurnstile', () => {
  it('skips verification (no fetch) when the secret is unset', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyTurnstile(undefined)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the secret + token to siteverify and resolves on success', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'shh';
    const fetchMock = vi.fn(async () => jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyTurnstile('tok-123', '203.0.113.7')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('siteverify');
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain('secret=shh');
    expect(body).toContain('response=tok-123');
    expect(body).toContain('remoteip=203.0.113.7');
  });

  it('throws INVALID_REQUEST when the token is missing (no fetch)', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'shh';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyTurnstile('   ')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws INVALID_REQUEST when Cloudflare reports failure', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'shh';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] })),
    );

    const err = await verifyTurnstile('bad-token').catch((e) => e);
    expect(err).toBeInstanceOf(ApiException);
    expect(err.code).toBe('INVALID_REQUEST');
  });

  it('throws UPSTREAM_ERROR when siteverify is unreachable', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'shh';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(verifyTurnstile('tok')).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});

describe('clientIp', () => {
  it('reads the first hop from x-forwarded-for', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' },
    });
    expect(clientIp(req)).toBe('198.51.100.9');
  });

  it('is undefined when the header is absent', () => {
    expect(clientIp(new Request('https://example.com'))).toBeUndefined();
  });
});
