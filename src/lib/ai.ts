/**
 * Mistral image-generation service (tech-stack.md §5, architecture.md §4).
 *
 * Mistral has no plain image endpoint — image generation runs through the
 * Agents API with the `image_generation` tool (FLUX1.1 [pro] Ultra under the
 * hood, agent model `mistral-medium-latest`). The flow:
 *   1. Ensure an agent with the `image_generation` tool exists — created once
 *      per process and cached, or reused via `MISTRAL_AGENT_ID`.
 *   2. POST a conversation with the prompt; the response carries a `tool_file`
 *      chunk with a `file_id`.
 *   3. Download the bytes from the files endpoint.
 *
 * The whole provider sits behind this one module, so a different image model can
 * be swapped in without touching routes or UI. All failures surface as typed
 * {@link ApiException}s (`TIMEOUT` / `NO_IMAGE` / `UPSTREAM_ERROR`) that routes
 * map to retryable error states.
 *
 * Server-only: reads `MISTRAL_API_KEY` and must never be imported by a client
 * component.
 */

import { ApiException } from './http';

const API_BASE = 'https://api.mistral.ai/v1';
export const AGENT_MODEL = 'mistral-medium-latest';
const DEFAULT_TIMEOUT_MS = 60_000;

function apiKey(): string | undefined {
  return process.env.MISTRAL_API_KEY?.trim() || undefined;
}

/** Whether the provider key is configured (used by /api/health). */
export function isConfigured(): boolean {
  return Boolean(apiKey());
}

function requireKey(): string {
  const key = apiKey();
  if (!key) {
    // Generic to the client; the real reason is logged by toErrorResponse.
    throw new ApiException('INTERNAL', {
      message: 'MISTRAL_API_KEY is not configured',
    });
  }
  return key;
}

/** fetch with an abort-based timeout; maps abort → TIMEOUT, network → UPSTREAM. */
async function apiFetch(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${requireKey()}`,
        ...init.headers,
      },
    });
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

// --- Agent lifecycle (created once, cached, deduped across concurrent calls) ---

let agentPromise: Promise<string> | null = null;

async function createAgent(timeoutMs: number): Promise<string> {
  const res = await apiFetch(
    '/agents',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AGENT_MODEL,
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

/** Resolve the agent id: env override, else create-and-cache once per process. */
async function ensureAgent(timeoutMs: number): Promise<string> {
  const fromEnv = process.env.MISTRAL_AGENT_ID?.trim();
  if (fromEnv) return fromEnv;

  if (!agentPromise) {
    agentPromise = createAgent(timeoutMs).catch((err) => {
      agentPromise = null; // allow retry on next call
      throw err;
    });
  }
  return agentPromise;
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

export interface GeneratedImage {
  bytes: Uint8Array;
  model: string;
}

/**
 * Generate a single logo image from a fully-constructed prompt.
 *
 * @throws {ApiException} TIMEOUT (slow upstream), NO_IMAGE (model returned no
 *   file, e.g. a content refusal), or UPSTREAM_ERROR (non-2xx / network).
 */
export async function generateImage(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<GeneratedImage> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const agentId = await ensureAgent(timeoutMs);

  const convRes = await apiFetch(
    '/conversations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const fileRes = await apiFetch(
    `/files/${encodeURIComponent(fileId)}/content`,
    { method: 'GET' },
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
  return { bytes, model: AGENT_MODEL };
}
