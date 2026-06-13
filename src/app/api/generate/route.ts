import { randomUUID } from 'node:crypto';
import { generateImage } from '@/lib/ai';
import { insertConcept } from '@/lib/db';
import { ApiException, jsonError, jsonOk, parseJsonBody, toErrorResponse } from '@/lib/http';
import { buildConceptPrompts, validateBrief } from '@/lib/prompt';
import { saveImage } from '@/lib/storage';
import { clientIp, verifyTurnstile } from '@/lib/turnstile';
import type { GenerateRequest, GenerateResponse, LogoBrief, LogoConcept } from '@/lib/types';

export const dynamic = 'force-dynamic';
// Allow the 12-concept fan-out to run beyond the default on serverless hosts.
export const maxDuration = 60;

// Bounded parallelism so we never open 12 upstream calls at once.
const CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

async function generateOne(prompt: string, brief: LogoBrief): Promise<LogoConcept> {
  const { bytes, model } = await generateImage(prompt);
  const id = randomUUID();
  const stored = await saveImage(bytes, id);
  const concept: LogoConcept = {
    id: stored.id,
    prompt,
    imageUrl: stored.url,
    imageFilename: stored.filename,
    contentType: stored.contentType,
    model,
    createdAt: new Date().toISOString(),
    params: { brief },
  };
  return await insertConcept(concept);
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody<GenerateRequest>(req);

    // Bot check (no-op unless TURNSTILE_SECRET_KEY is set) before any AI work.
    await verifyTurnstile(body?.turnstileToken, clientIp(req));

    const validation = validateBrief(body?.brief);
    if (!validation.ok) {
      // Surface the first field error as the user-facing INVALID_PROMPT message.
      return jsonError('INVALID_PROMPT', validation.errors[0]?.message);
    }
    const brief = validation.brief;

    const prompts = buildConceptPrompts(brief);
    const settled = await mapWithConcurrency(prompts, CONCURRENCY, (p) =>
      generateOne(p, brief),
    );

    const concepts = settled
      .filter((r): r is PromiseFulfilledResult<LogoConcept> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (concepts.length === 0) {
      // All concepts failed — propagate a representative typed error so the UI
      // shows the right retryable state.
      const firstRejection = settled.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      const reason = firstRejection?.reason;
      throw reason instanceof ApiException
        ? reason
        : new ApiException('UPSTREAM_ERROR', { cause: reason });
    }

    const response: GenerateResponse = { concepts };
    return jsonOk(response);
  } catch (err) {
    return toErrorResponse(err);
  }
}
