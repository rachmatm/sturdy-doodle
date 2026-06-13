import { InvalidFilenameError, readImage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  let result: Awaited<ReturnType<typeof readImage>>;
  try {
    result = await readImage(filename);
  } catch (err) {
    if (err instanceof InvalidFilenameError) {
      return new Response('Invalid filename', { status: 400 });
    }
    console.error('[api] images read error:', err);
    return new Response('Internal error', { status: 500 });
  }

  if (!result) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      // UUID filenames are immutable, so cache aggressively.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(result.bytes.length),
    },
  });
}
