import { countConcepts, listConcepts } from '@/lib/db';
import { ApiException, jsonOk, toErrorResponse } from '@/lib/http';
import type { GalleryResponse } from '@/lib/types';

// The gallery must always reflect the current database so it persists across
// refreshes and concurrent writes — never cache it (architecture.md §7).
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

/**
 * Parse a non-negative integer query param. Returns `fallback` when absent;
 * throws INVALID_REQUEST when present but not a non-negative integer.
 */
function parseNonNegativeInt(raw: string | null, fallback: number): number {
  if (raw === null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new ApiException('INVALID_REQUEST', {
      message: `non-integer pagination param: ${raw}`,
      publicMessage: 'Invalid pagination parameter.',
    });
  }
  return Number(raw);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const offset = parseNonNegativeInt(params.get('offset'), 0);
    const requested = parseNonNegativeInt(params.get('limit'), DEFAULT_LIMIT);
    const limit = Math.min(Math.max(requested, 1), MAX_LIMIT);

    const total = countConcepts();
    const concepts = listConcepts(limit, offset);

    // Cursor for the next page; null once this page reaches the end.
    const nextStart = offset + concepts.length;
    const response: GalleryResponse = {
      concepts,
      total,
      nextOffset: nextStart < total ? nextStart : null,
    };
    return jsonOk(response);
  } catch (err) {
    return toErrorResponse(err);
  }
}
