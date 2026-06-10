import { isConfigured } from '@/lib/ai';
import { jsonOk } from '@/lib/http';
import type { HealthResponse } from '@/lib/types';

// Liveness + config probe: reflect the current env at request time, never cached.
export const dynamic = 'force-dynamic';

export async function GET() {
  const body: HealthResponse = {
    status: 'ok',
    aiKeyConfigured: isConfigured(),
  };
  return jsonOk(body);
}
