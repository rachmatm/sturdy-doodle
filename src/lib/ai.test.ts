/**
 * Unit tests for the multi-provider / multi-key fallback in `ai.ts`.
 *
 * The fallback chain (provider order × key pool, rolling over on any per-key
 * failure) is pure, deterministic logic, so we exercise it against a mocked
 * `fetch` — no real Mistral/Pixazo calls, no API quota, no rate-limit flakiness.
 * Each test sets only the env vars it needs; `ai.ts` reads `process.env` at call
 * time, so no module reset is required. Mistral tests set `MISTRAL_AGENT_ID` to
 * skip live agent creation (and avoid touching the module-level agent cache).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateImage, isConfigured, MISTRAL_MODEL, PIXAZO_MODEL } from './ai';
import { ApiException } from './http';
import { getStoredAgentId, saveAgentId } from './db';

// Stub the persistence layer so agent-resolution tests never touch a real DB.
vi.mock('./db', () => ({
  getStoredAgentId: vi.fn(async () => null),
  saveAgentId: vi.fn(async () => {}),
}));
const mockGetStoredAgentId = vi.mocked(getStoredAgentId);
const mockSaveAgentId = vi.mocked(saveAgentId);

const ENV_KEYS = [
  'IMAGE_PROVIDER',
  'IMAGE_KEY_STRATEGY',
  'MISTRAL_API_KEY',
  'MISTRAL_API_KEYS',
  'PIXAZO_API_KEY',
  'PIXAZO_API_KEYS',
  'MISTRAL_AGENT_ID',
] as const;

const IMG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // non-empty; content unchecked

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Build a mocked `fetch` that grants success only to the listed keys; every
 * other key gets a 429 (the free-tier rate-limit case the fallback exists for).
 * `generateKeys` records, in order, every key tried at the generate step — so
 * tests can assert exactly which keys were attempted and in what sequence.
 */
function buildFetch({
  goodPixazo = new Set<string>(),
  goodMistral = new Set<string>(),
}: { goodPixazo?: Set<string>; goodMistral?: Set<string> } = {}) {
  const generateKeys: string[] = [];

  const fn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    const headers = (init.headers ?? {}) as Record<string, string>;

    // Image-byte downloads (pixazo output URL or mistral file content).
    if (u.startsWith('https://img.example/') || u.includes('/files/')) {
      return new Response(IMG_BYTES, { status: 200 });
    }

    // Pixazo synchronous generate.
    if (u.includes('gateway.pixazo.ai')) {
      const key = headers['Ocp-Apim-Subscription-Key'];
      generateKeys.push(key);
      if (!goodPixazo.has(key)) return new Response('rate limited', { status: 429 });
      return jsonResponse({ output: 'https://img.example/pix.png' });
    }

    // Mistral conversation (agent supplied via MISTRAL_AGENT_ID, so no /agents call).
    if (u.includes('api.mistral.ai') && u.endsWith('/conversations')) {
      const key = String(headers['Authorization']).replace('Bearer ', '');
      generateKeys.push(key);
      if (!goodMistral.has(key)) return new Response('rate limited', { status: 429 });
      return jsonResponse({ outputs: [{ content: [{ file_id: 'file-1' }] }] });
    }

    throw new Error(`unexpected fetch: ${u}`);
  });

  return { fn, generateKeys };
}

async function catchErr(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
    throw new Error('expected promise to reject, but it resolved');
  } catch (err) {
    return err;
  }
}

/**
 * A mocked `fetch` for the Mistral agent lifecycle: the list-agents endpoint
 * returns `listIds`, agent creation returns `createId`, and conversation +
 * file-download succeed. Records how many times each endpoint was hit.
 */
function buildMistralAgentFetch({
  listIds = [] as string[],
  createId = 'agent-new',
} = {}) {
  const calls = { listed: 0, created: 0 };
  const fn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    const method = (init.method ?? 'GET').toUpperCase();

    if (u.includes('/agents') && method === 'GET') {
      calls.listed++;
      return jsonResponse(listIds.map((id) => ({ id })));
    }
    if (u.endsWith('/agents') && method === 'POST') {
      calls.created++;
      return jsonResponse({ id: createId });
    }
    if (u.endsWith('/conversations')) {
      return jsonResponse({ outputs: [{ content: [{ file_id: 'file-1' }] }] });
    }
    if (u.includes('/files/')) return new Response(IMG_BYTES, { status: 200 });
    throw new Error(`unexpected fetch: ${method} ${u}`);
  });
  return { fn, calls };
}

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  mockGetStoredAgentId.mockReset().mockResolvedValue(null);
  mockSaveAgentId.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('isConfigured', () => {
  it('is false when no provider key is set', () => {
    expect(isConfigured()).toBe(false);
  });

  it('is true once a key for an in-order provider is present', () => {
    process.env.MISTRAL_API_KEY = 'm1'; // mistral is the default provider order
    expect(isConfigured()).toBe(true);
  });

  // Documents a footgun: the provider order defaults to ['mistral'], so keys for
  // a provider NOT in IMAGE_PROVIDER are ignored. A pixazo-only deployment that
  // forgets `IMAGE_PROVIDER=pixazo` reports unconfigured and never uses its keys.
  it('ignores pixazo keys when IMAGE_PROVIDER is unset (default order is mistral)', () => {
    process.env.PIXAZO_API_KEY = 'p1';
    expect(isConfigured()).toBe(false);

    process.env.IMAGE_PROVIDER = 'pixazo';
    expect(isConfigured()).toBe(true);
  });
});

describe('generateImage fallback', () => {
  it('rolls over a rate-limited key to the next key in the same pool', async () => {
    // 2 pixazo keys; the first 429s, the second succeeds.
    process.env.IMAGE_PROVIDER = 'pixazo';
    process.env.PIXAZO_API_KEY = 'p1';
    process.env.PIXAZO_API_KEYS = 'p2';
    const { fn, generateKeys } = buildFetch({ goodPixazo: new Set(['p2']) });
    vi.stubGlobal('fetch', fn);

    const img = await generateImage('a clean wordmark');

    expect(img.model).toBe(PIXAZO_MODEL);
    expect(img.bytes.length).toBeGreaterThan(0);
    expect(generateKeys).toEqual(['p1', 'p2']); // p1 tried then rolled to p2
  });

  it('short-circuits on the first successful key (no needless attempts)', async () => {
    process.env.IMAGE_PROVIDER = 'pixazo';
    process.env.PIXAZO_API_KEY = 'p1';
    process.env.PIXAZO_API_KEYS = 'p2';
    const { fn, generateKeys } = buildFetch({ goodPixazo: new Set(['p1', 'p2']) });
    vi.stubGlobal('fetch', fn);

    const img = await generateImage('brief');

    expect(img.model).toBe(PIXAZO_MODEL);
    expect(generateKeys).toEqual(['p1']); // p2 never attempted
  });

  it('rolls over across providers when a whole pool is exhausted', async () => {
    // Both pixazo keys fail; falls through to mistral, which succeeds.
    process.env.IMAGE_PROVIDER = 'pixazo,mistral';
    process.env.PIXAZO_API_KEY = 'p1';
    process.env.PIXAZO_API_KEYS = 'p2';
    process.env.MISTRAL_API_KEY = 'm1';
    process.env.MISTRAL_AGENT_ID = 'agent-x';
    const { fn, generateKeys } = buildFetch({ goodMistral: new Set(['m1']) });
    vi.stubGlobal('fetch', fn);

    const img = await generateImage('brief');

    expect(img.model).toBe(MISTRAL_MODEL);
    expect(generateKeys).toEqual(['p1', 'p2', 'm1']);
  });

  it('walks the full 2-pixazo + 2-mistral chain in order, then throws the last error', async () => {
    process.env.IMAGE_PROVIDER = 'pixazo,mistral';
    process.env.PIXAZO_API_KEY = 'p1';
    process.env.PIXAZO_API_KEYS = 'p2';
    process.env.MISTRAL_API_KEY = 'm1';
    process.env.MISTRAL_API_KEYS = 'm2';
    process.env.MISTRAL_AGENT_ID = 'agent-x';
    const { fn, generateKeys } = buildFetch(); // every key 429s
    vi.stubGlobal('fetch', fn);

    const err = await catchErr(generateImage('brief'));

    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).code).toBe('UPSTREAM_ERROR');
    expect(generateKeys).toEqual(['p1', 'p2', 'm1', 'm2']);
  });

  it('de-dupes a key repeated across the single + list vars', async () => {
    process.env.IMAGE_PROVIDER = 'pixazo';
    process.env.PIXAZO_API_KEY = 'dup';
    process.env.PIXAZO_API_KEYS = 'dup'; // same key — should be tried once
    const { fn, generateKeys } = buildFetch(); // fails, so we can count attempts
    vi.stubGlobal('fetch', fn);

    await catchErr(generateImage('brief'));

    expect(generateKeys).toEqual(['dup']);
  });

  it('throws INTERNAL when no provider is configured', async () => {
    const { fn } = buildFetch();
    vi.stubGlobal('fetch', fn);

    const err = await catchErr(generateImage('brief'));

    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).code).toBe('INTERNAL');
    expect(fn).not.toHaveBeenCalled();
  });

  it('defaults to fallback: every call starts at the first key (no rotation)', async () => {
    // No IMAGE_KEY_STRATEGY → strict priority. Both keys succeed, so each call
    // short-circuits at p1; across 3 calls p2 is never reached.
    process.env.IMAGE_PROVIDER = 'pixazo';
    process.env.PIXAZO_API_KEY = 'p1';
    process.env.PIXAZO_API_KEYS = 'p2';
    const { fn, generateKeys } = buildFetch({ goodPixazo: new Set(['p1', 'p2']) });
    vi.stubGlobal('fetch', fn);

    await generateImage('a');
    await generateImage('b');
    await generateImage('c');

    expect(generateKeys).toEqual(['p1', 'p1', 'p1']);
  });
});

// Round-robin rotates the starting provider+key per request. The rotation
// counter is module-level (persists across tests), so these assert *relative*
// patterns (alternation / set coverage), never an absolute "call 1 starts at X".
describe('round-robin key strategy', () => {
  it('alternates the starting provider across successive requests', async () => {
    process.env.IMAGE_PROVIDER = 'mistral,pixazo';
    process.env.IMAGE_KEY_STRATEGY = 'round-robin';
    process.env.MISTRAL_API_KEY = 'm1';
    process.env.PIXAZO_API_KEY = 'p1';
    process.env.MISTRAL_AGENT_ID = 'agent-x'; // skip live agent creation
    const { fn } = buildFetch({
      goodMistral: new Set(['m1']),
      goodPixazo: new Set(['p1']),
    });
    vi.stubGlobal('fetch', fn);

    const models = [
      (await generateImage('a')).model,
      (await generateImage('b')).model,
      (await generateImage('c')).model,
      (await generateImage('d')).model,
    ];

    // Both providers are exercised and consecutive calls differ (A,B,A,B).
    expect(new Set(models)).toEqual(new Set([MISTRAL_MODEL, PIXAZO_MODEL]));
    expect(models[0]).not.toBe(models[1]);
    expect(models[1]).not.toBe(models[2]);
    expect(models[2]).not.toBe(models[3]);
  });

  it('still rolls over within a request when the starting provider fails', async () => {
    // Only mistral succeeds; whether a call starts on pixazo or mistral, it must
    // roll over and return a mistral image — full fallback is preserved.
    process.env.IMAGE_PROVIDER = 'mistral,pixazo';
    process.env.IMAGE_KEY_STRATEGY = 'round-robin';
    process.env.MISTRAL_API_KEY = 'm1';
    process.env.PIXAZO_API_KEY = 'p1';
    process.env.MISTRAL_AGENT_ID = 'agent-x';
    const { fn } = buildFetch({ goodMistral: new Set(['m1']) }); // pixazo 429s
    vi.stubGlobal('fetch', fn);

    const first = await generateImage('a');
    const second = await generateImage('b'); // different rotation offset

    expect(first.model).toBe(MISTRAL_MODEL);
    expect(second.model).toBe(MISTRAL_MODEL);
  });

  it('visits every provider×key exactly once before failing', async () => {
    // 2 providers × 2 keys, all rate-limited. Regardless of the rotation offset,
    // the rollover must cover the whole chain (each key tried once) then throw.
    process.env.IMAGE_PROVIDER = 'mistral,pixazo';
    process.env.IMAGE_KEY_STRATEGY = 'round-robin';
    process.env.MISTRAL_API_KEY = 'm1';
    process.env.MISTRAL_API_KEYS = 'm2';
    process.env.PIXAZO_API_KEY = 'p1';
    process.env.PIXAZO_API_KEYS = 'p2';
    process.env.MISTRAL_AGENT_ID = 'agent-x';
    const { fn, generateKeys } = buildFetch(); // every key 429s
    vi.stubGlobal('fetch', fn);

    const err = await catchErr(generateImage('brief'));

    expect(err).toBeInstanceOf(ApiException);
    expect(generateKeys).toHaveLength(4);
    expect(new Set(generateKeys)).toEqual(new Set(['m1', 'm2', 'p1', 'p2']));
  });
});

// Each test uses a distinct Mistral key so the module-level per-key agent cache
// (which persists for the test file's lifetime) never leaks between cases.
describe('mistral agent resolution', () => {
  it('reuses a DB-stored agent that still exists upstream (no creation)', async () => {
    process.env.IMAGE_PROVIDER = 'mistral';
    process.env.MISTRAL_API_KEY = 'm-reuse';
    mockGetStoredAgentId.mockResolvedValue('agent-stored');
    const { fn, calls } = buildMistralAgentFetch({ listIds: ['other', 'agent-stored'] });
    vi.stubGlobal('fetch', fn);

    const img = await generateImage('brief');

    expect(img.model).toBe(MISTRAL_MODEL);
    expect(calls.listed).toBe(1); // verified via list-agents
    expect(calls.created).toBe(0); // existing agent reused
    expect(mockSaveAgentId).not.toHaveBeenCalled();
  });

  it('creates and persists an agent when none is stored', async () => {
    process.env.IMAGE_PROVIDER = 'mistral';
    process.env.MISTRAL_API_KEY = 'm-create';
    mockGetStoredAgentId.mockResolvedValue(null);
    const { fn, calls } = buildMistralAgentFetch({ createId: 'agent-fresh' });
    vi.stubGlobal('fetch', fn);

    const img = await generateImage('brief');

    expect(img.model).toBe(MISTRAL_MODEL);
    expect(calls.listed).toBe(0); // nothing stored, so no verification
    expect(calls.created).toBe(1);
    expect(mockSaveAgentId).toHaveBeenCalledWith(
      expect.any(String),
      'agent-fresh',
      MISTRAL_MODEL,
    );
  });

  it('recreates and re-persists when the stored agent is gone upstream', async () => {
    process.env.IMAGE_PROVIDER = 'mistral';
    process.env.MISTRAL_API_KEY = 'm-gone';
    mockGetStoredAgentId.mockResolvedValue('agent-deleted');
    // list returns only an unrelated agent → stored id verified absent.
    const { fn, calls } = buildMistralAgentFetch({
      listIds: ['someone-else'],
      createId: 'agent-replacement',
    });
    vi.stubGlobal('fetch', fn);

    const img = await generateImage('brief');

    expect(img.model).toBe(MISTRAL_MODEL);
    expect(calls.listed).toBe(1);
    expect(calls.created).toBe(1);
    expect(mockSaveAgentId).toHaveBeenCalledWith(
      expect.any(String),
      'agent-replacement',
      MISTRAL_MODEL,
    );
  });

  it('never reads the agent store when MISTRAL_AGENT_ID is set (explicit override)', async () => {
    process.env.IMAGE_PROVIDER = 'mistral';
    process.env.MISTRAL_API_KEY = 'm-env';
    process.env.MISTRAL_AGENT_ID = 'agent-from-env';
    const { fn, calls } = buildMistralAgentFetch();
    vi.stubGlobal('fetch', fn);

    const img = await generateImage('brief');

    expect(img.model).toBe(MISTRAL_MODEL);
    expect(mockGetStoredAgentId).not.toHaveBeenCalled();
    expect(mockSaveAgentId).not.toHaveBeenCalled();
    expect(calls.listed).toBe(0);
    expect(calls.created).toBe(0);
  });
});
