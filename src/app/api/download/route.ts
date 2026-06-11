import type { NextRequest } from 'next/server';
import { getConcept } from '@/lib/db';
import { jsonError } from '@/lib/http';
import { InvalidFilenameError, readImage } from '@/lib/storage';
import {
  FREE_DOWNLOAD_FORMAT,
  PREMIUM_DOWNLOAD_FORMATS,
  type DownloadFormat,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Map a detected image content type to a download file extension. */
const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Turn a business name into a safe, friendly download stem. Falls back to
 * "logo" when the name has no usable characters.
 */
function fileStem(businessName: string | undefined): string {
  const slug = (businessName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'logo';
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const id = params.get('id')?.trim() ?? '';
  if (!id) {
    return jsonError('INVALID_REQUEST', 'A logo to download is required.');
  }

  // PNG is the only free format. Premium formats are deliberately not faked
  // (PRD §5.2, §9): reject them clearly rather than returning the wrong bytes.
  const format = (params.get('format')?.trim() || FREE_DOWNLOAD_FORMAT) as DownloadFormat;
  if ((PREMIUM_DOWNLOAD_FORMATS as readonly string[]).includes(format)) {
    return jsonError('INVALID_REQUEST', `The ${format} format is not available yet.`);
  }
  if (format !== FREE_DOWNLOAD_FORMAT) {
    return jsonError('INVALID_REQUEST', 'Unsupported download format.');
  }

  const concept = getConcept(id);
  if (!concept) {
    return jsonError('INVALID_REQUEST', 'That logo is no longer in the gallery.');
  }

  let result: ReturnType<typeof readImage>;
  try {
    result = readImage(concept.imageFilename);
  } catch (err) {
    if (err instanceof InvalidFilenameError) {
      return jsonError('INVALID_REQUEST', 'That logo could not be found.');
    }
    console.error('[api] download read error:', err);
    return jsonError('INTERNAL');
  }

  if (!result) {
    return jsonError('INVALID_REQUEST', 'That logo could not be found.');
  }

  const ext = CONTENT_TYPE_EXT[result.contentType] ?? 'png';
  const downloadName = `${fileStem(concept.params?.brief?.businessName)}-${concept.id.slice(0, 8)}.${ext}`;

  return new Response(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Content-Length': String(result.bytes.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
