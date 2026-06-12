/**
 * Image-generation service (tech-stack.md §5, architecture.md §4).
 *
 * The whole image provider sits behind this one module, so routes and UI never
 * change when the provider does. Two providers are supported, each with a pool
 * of API keys for free-tier fallback:
 *
 *   - **mistral** — Mistral has no plain image endpoint, so generation runs
 *     through the Agents API with the `image_generation` tool (FLUX1.1 [pro]
 *     Ultra under the hood, agent model `mistral-medium-latest`): ensure an
 *     agent (created once per key and cached, or reused via `MISTRAL_AGENT_ID`),
 *     POST a conversation, then download the `file_id` bytes.
 *   - **pixazo** — FLUX.1 Schnell via the pixazo gateway: a single synchronous
 *     POST returns `{ output: <url> }`; we fetch the bytes from that URL.
 *
 * `IMAGE_PROVIDER` is an ordered, comma-separated list of providers to try
 * (default `mistral`). For each prompt, {@link generateImage} walks every
 * provider in order and every key within it, returning the first success — so a
 * rate-limited free-tier key (429) simply rolls over to the next key/provider.
 * All failures surface as typed {@link ApiException}s (`TIMEOUT` / `NO_IMAGE` /
 * `UPSTREAM_ERROR`) that routes map to retryable error states.
 *
 * Server-only: reads provider API keys and must never be imported by a client
 * component.
 */

import { ApiException } from './http';

const MISTRAL_BASE = 'https://api.mistral.ai/v1';
const PIXAZO_SCHNELL_URL = 'https://gateway.pixazo.ai/flux-1-schnell/v1/getData';
export const MISTRAL_MODEL = 'mistral-medium-latest';
export const PIXAZO_MODEL = 'flux-1-schnell';
const DEFAULT_TIMEOUT_MS = 60_000;

type Provider = 'mistral' | 'pixazo';
const KNOWN_PROVIDERS: readonly Provider[] = ['mistral', 'pixazo'];

/** Split a comma/whitespace-separated env value into trimmed, non-empty parts. */
function splitList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Order-preserving de-dup. */
function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

/** Keys for a provider: the single-key var first, then the list var, de-duped. */
function keysFor(provider: Provider): string[] {
  if (provider === 'mistral') {
    return dedupe([
      ...splitList(process.env.MISTRAL_API_KEY),
      ...splitList(process.env.MISTRAL_API_KEYS),
    ]);
  }
  return dedupe([
    ...splitList(process.env.PIXAZO_API_KEY),
    ...splitList(process.env.PIXAZO_API_KEYS),
  ]);
}

/** Ordered list of providers to try, from `IMAGE_PROVIDER` (default mistral). */
function providerOrder(): Provider[] {
  const raw = splitList(process.env.IMAGE_PROVIDER);
  const order = (raw.length ? raw : ['mistral']).filter((p): p is Provider =>
    (KNOWN_PROVIDERS as readonly string[]).includes(p),
  );
  return order.length ? order : ['mistral'];
}

/** All (provider, key) attempts in fallback order. */
function attemptChain(): { provider: Provider; key: string }[] {
  const chain: { provider: Provider; key: string }[] = [];
  for (const provider of providerOrder()) {
    for (const key of keysFor(provider)) chain.push({ provider, key });
  }
  return chain;
}

/** Whether at least one provider in the order has a key configured. */
export function isConfigured(): boolean {
  return attemptChain().length > 0;
}

/** fetch with an abort-based timeout; maps abort → TIMEOUT, network → UPSTREAM. */
async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ApiException('TIMEOUT', { cause });
    }
    throw new ApiException('UPSTREAM_ERROR', { cause });
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<unreadable>';
  }
}

export interface GeneratedImage {
  bytes: Uint8Array;
  model: string;
}

// --- Mistral: agent lifecycle (created once per key, cached, deduped) ---

const agentByKey = new Map<string, Promise<string>>();

async function createAgent(key: string, timeoutMs: number): Promise<string> {
  const res = await timedFetch(
    `${MISTRAL_BASE}/agents`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        name: 'logo-generator',
        description: 'Generates logo concepts for the AI Logo Generator.',
        instructions:
          'You generate clean, professional, scalable vector-style logo concepts from a design brief. Always use the image_generation tool to produce the image.',
        tools: [{ type: 'image_generation' }],
      }),
    },
    timeoutMs,
  );

  if (!res.ok) {
    console.error('[ai] create agent failed', res.status, await readErrorBody(res));
    throw new ApiException('UPSTREAM_ERROR', {
      message: `agent creation failed (${res.status})`,
    });
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) {
    throw new ApiException('UPSTREAM_ERROR', { message: 'agent creation returned no id' });
  }
  return data.id;
}

/** Resolve the agent id for a key: env override, else create-and-cache once. */
async function ensureAgent(key: string, timeoutMs: number): Promise<string> {
  const fromEnv = process.env.MISTRAL_AGENT_ID?.trim();
  if (fromEnv) return fromEnv;

  let promise = agentByKey.get(key);
  if (!promise) {
    promise = createAgent(key, timeoutMs).catch((err) => {
      agentByKey.delete(key); // allow retry on next call
      throw err;
    });
    agentByKey.set(key, promise);
  }
  return promise;
}

// --- Response parsing: find the generated file id among conversation outputs ---

function extractFileId(payload: unknown): string | null {
  const outputs =
    (payload as { outputs?: unknown[] })?.outputs ??
    (payload as { messages?: unknown[] })?.messages ??
    [];
  if (!Array.isArray(outputs)) return null;

  for (const output of outputs) {
    const content = (output as { content?: unknown })?.content;
    const chunks = Array.isArray(content) ? content : [content];
    for (const chunk of chunks) {
      if (chunk && typeof chunk === 'object') {
        const fileId =
          (chunk as { file_id?: unknown }).file_id ??
          (chunk as { fileId?: unknown }).fileId;
        if (typeof fileId === 'string' && fileId) return fileId;
      }
    }
  }
  return null;
}

async function generateImageMistral(
  prompt: string,
  key: string,
  timeoutMs: number,
): Promise<GeneratedImage> {
  const agentId = await ensureAgent(key, timeoutMs);

  const convRes = await timedFetch(
    `${MISTRAL_BASE}/conversations`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, inputs: prompt }),
    },
    timeoutMs,
  );

  if (!convRes.ok) {
    console.error('[ai] conversation failed', convRes.status, await readErrorBody(convRes));
    throw new ApiException('UPSTREAM_ERROR', {
      message: `generation failed (${convRes.status})`,
    });
  }

  const fileId = extractFileId(await convRes.json());
  if (!fileId) {
    throw new ApiException('NO_IMAGE', { message: 'model returned no image' });
  }

  const fileRes = await timedFetch(
    `${MISTRAL_BASE}/files/${encodeURIComponent(fileId)}/content`,
    { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
    timeoutMs,
  );
  if (!fileRes.ok) {
    console.error('[ai] file download failed', fileRes.status, await readErrorBody(fileRes));
    throw new ApiException('UPSTREAM_ERROR', {
      message: `image download failed (${fileRes.status})`,
    });
  }

  const bytes = new Uint8Array(await fileRes.arrayBuffer());
  if (bytes.length === 0) {
    throw new ApiException('NO_IMAGE', { message: 'downloaded image was empty' });
  }
  return { bytes, model: MISTRAL_MODEL };
}

// --- Pixazo: FLUX.1 Schnell, synchronous { output: url } then fetch bytes ---

async function generateImagePixazo(
  prompt: string,
  key: string,
  timeoutMs: number,
): Promise<GeneratedImage> {
  const res = await timedFetch(
    PIXAZO_SCHNELL_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Ocp-Apim-Subscription-Key': key,
      },
      body: JSON.stringify({ prompt, num_steps: 4, width: 1024, height: 1024 }),
    },
    timeoutMs,
  );

  if (!res.ok) {
    console.error('[ai] pixazo generate failed', res.status, await readErrorBody(res));
    throw new ApiException('UPSTREAM_ERROR', {
      message: `generation failed (${res.status})`,
    });
  }

  const data = (await res.json().catch(() => null)) as { output?: unknown } | null;
  const url = data?.output;
  if (typeof url !== 'string' || !url) {
    throw new ApiException('NO_IMAGE', { message: 'pixazo returned no image url' });
  }

  const imgRes = await timedFetch(url, { method: 'GET' }, timeoutMs);
  if (!imgRes.ok) {
    console.error('[ai] pixazo download failed', imgRes.status);
    throw new ApiException('UPSTREAM_ERROR', {
      message: `image download failed (${imgRes.status})`,
    });
  }

  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  if (bytes.length === 0) {
    throw new ApiException('NO_IMAGE', { message: 'downloaded image was empty' });
  }
  return { bytes, model: PIXAZO_MODEL };
}

function generateWith(
  provider: Provider,
  prompt: string,
  key: string,
  timeoutMs: number,
): Promise<GeneratedImage> {
  return provider === 'pixazo'
    ? generateImagePixazo(prompt, key, timeoutMs)
    : generateImageMistral(prompt, key, timeoutMs);
}

/**
 * Generate a single logo image from a fully-constructed prompt, trying each
 * configured provider/key in {@link providerOrder} order until one succeeds.
 *
 * @throws {ApiException} INTERNAL (no provider configured), or the last
 *   provider failure (TIMEOUT / NO_IMAGE / UPSTREAM_ERROR) once every fallback
 *   in the chain is exhausted.
 */
export async function generateImage(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<GeneratedImage> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const chain = attemptChain();
  if (chain.length === 0) {
    throw new ApiException('INTERNAL', { message: 'no image provider configured' });
  }

  let lastError: unknown;
  for (let i = 0; i < chain.length; i++) {
    const { provider, key } = chain[i];
    try {
      return await generateWith(provider, prompt, key, timeoutMs);
    } catch (err) {
      lastError = err;
      // Fall through to the next key/provider; a free-tier 429 on one account
      // should roll over rather than fail the whole image.
    }
  }

  throw lastError instanceof ApiException
    ? lastError
    : new ApiException('UPSTREAM_ERROR', { cause: lastError });
}
