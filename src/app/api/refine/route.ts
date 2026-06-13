import { randomUUID } from 'node:crypto';
import { generateImage } from '@/lib/ai';
import { getConcept, insertConcept } from '@/lib/db';
import { ApiException, jsonError, jsonOk, parseJsonBody, toErrorResponse } from '@/lib/http';
import { buildRefinePrompt } from '@/lib/prompt';
import { saveImage } from '@/lib/storage';
import {
  REFINEMENT_CHANGE_TARGETS,
  REFINEMENT_DIRECTIVES,
  type LogoBrief,
  type LogoConcept,
  type LogoParams,
  type RefineRequest,
  type RefineResponse,
  type RefinementChange,
  type RefinementDirective,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
// Refinement fans out a few upstream image calls; allow beyond the default.
export const maxDuration = 60;

// New variations per refinement. Kept at/below the generate route's concurrency
// bound (4) so the parallel upstream calls stay within the same envelope.
const REFINE_COUNT = 4;

interface NormalizedRefinement {
  directive?: RefinementDirective;
  change?: RefinementChange;
}

/**
 * Validate the refinement portion of the request. A refinement must carry at
 * least one meaningful tweak; an empty one is the "invalid prompt" failure
 * state (PRD §6) and is rejected before any AI call.
 */
function validateRefinement(
  body: RefineRequest,
): { ok: true; refinement: NormalizedRefinement } | { ok: false; message: string } {
  let directive: RefinementDirective | undefined;
  if (body.directive !== undefined) {
    if (!(REFINEMENT_DIRECTIVES as readonly string[]).includes(body.directive)) {
      return { ok: false, message: 'Unknown refinement directive.' };
    }
    directive = body.directive;
  }

  let change: RefinementChange | undefined;
  if (body.change !== undefined) {
    const target = body.change?.target;
    if (!(REFINEMENT_CHANGE_TARGETS as readonly string[]).includes(target)) {
      return { ok: false, message: 'Unknown refinement change target.' };
    }
    const value =
      typeof body.change.value === 'string' && body.change.value.trim()
        ? body.change.value.trim()
        : undefined;
    change = { target, value };
  }

  if (!directive && !change) {
    return { ok: false, message: 'Choose a refinement before re-generating.' };
  }

  return { ok: true, refinement: { directive, change } };
}

async function refineOne(
  prompt: string,
  brief: LogoBrief,
  refinement: NormalizedRefinement,
  refinedFrom: string,
): Promise<LogoConcept> {
  const { bytes, model } = await generateImage(prompt);
  const id = randomUUID();
  const stored = await saveImage(bytes, id);
  const params: LogoParams = {
    brief,
    directive: refinement.directive,
    change: refinement.change,
    refinedFrom,
  };
  const concept: LogoConcept = {
    id: stored.id,
    prompt,
    imageUrl: stored.url,
    imageFilename: stored.filename,
    contentType: stored.contentType,
    model,
    createdAt: new Date().toISOString(),
    params,
  };
  return await insertConcept(concept);
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody<RefineRequest>(req);

    const conceptId = typeof body?.conceptId === 'string' ? body.conceptId.trim() : '';
    if (!conceptId) {
      return jsonError('INVALID_REQUEST', 'A concept to refine is required.');
    }

    const refinementCheck = validateRefinement(body);
    if (!refinementCheck.ok) {
      return jsonError('INVALID_PROMPT', refinementCheck.message);
    }

    const original = await getConcept(conceptId);
    if (!original) {
      return jsonError('INVALID_REQUEST', 'That logo is no longer in the gallery.');
    }
    const brief = original.params?.brief;
    if (!brief) {
      return jsonError('INVALID_REQUEST', 'This logo can not be refined.');
    }

    const prompt = buildRefinePrompt(brief, refinementCheck.refinement);
    const settled = await Promise.allSettled(
      Array.from({ length: REFINE_COUNT }, () =>
        refineOne(prompt, brief, refinementCheck.refinement, original.id),
      ),
    );

    const concepts = settled
      .filter((r): r is PromiseFulfilledResult<LogoConcept> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (concepts.length === 0) {
      // Every variation failed — propagate a representative typed error so the
      // UI shows the right retryable state; nothing partial was saved.
      const firstRejection = settled.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      const reason = firstRejection?.reason;
      throw reason instanceof ApiException
        ? reason
        : new ApiException('UPSTREAM_ERROR', { cause: reason });
    }

    const response: RefineResponse = { concepts };
    return jsonOk(response);
  } catch (err) {
    return toErrorResponse(err);
  }
}
