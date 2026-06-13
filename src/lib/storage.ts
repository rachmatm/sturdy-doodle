/**
 * Image bytes storage (architecture.md §7, §8).
 *
 * Two interchangeable backends, selected at runtime from the environment:
 *  - **Vercel Blob** (`@vercel/blob`) when `BLOB_STORE_ID` and
 *    `BLOB_READ_WRITE_TOKEN` are both set — used on hosts without a writable
 *    disk (e.g. Vercel). Bytes live on Blob's public CDN; the stored "filename"
 *    is the absolute CDN URL, which the gallery loads directly and `readImage`
 *    fetches back for download.
 *  - **Filesystem** otherwise — bytes written atomically under `STORAGE_DIR`
 *    (outside `public/`), served via `/api/images/[filename]`.
 *
 * Both expose the same async API. Guarantees preserved across backends:
 *  - **Unique IDs** — UUID filename stems, so concurrent generations never
 *    clobber each other.
 *  - **Magic-byte typing** — the stored content type/extension comes from the
 *    bytes, not a caller-supplied value.
 *  - **Atomic writes** (filesystem) — temp file + rename, so a reader never sees
 *    a half-written image. Blob writes are atomic by nature (the URL only
 *    resolves once the upload completes).
 *  - **Path-traversal guard** (filesystem reads) — the filename must match the
 *    safe pattern and resolve inside the storage root (TC-SEC-002).
 *
 * Server-only: uses `node:fs` / the Blob write token and must not be imported by
 * a client component. Backends are dynamically imported so only the one in use
 * is loaded.
 */

import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

const DEFAULT_STORAGE_DIR = join(process.cwd(), 'storage', 'uploads');

/** True when the Vercel Blob credentials are present and Blob should be used. */
function blobEnabled(): boolean {
  return Boolean(
    process.env.BLOB_STORE_ID?.trim() && process.env.BLOB_READ_WRITE_TOKEN?.trim(),
  );
}

/** Absolute, normalized storage root from env (default ./storage/uploads). */
function storageRoot(): string {
  return resolve(process.env.STORAGE_DIR?.trim() || DEFAULT_STORAGE_DIR);
}

/** A safe stored filename: `<uuid>.<ext>`, lowercase hex + dashes only. */
const SAFE_FILENAME = /^[a-f0-9-]+\.[a-z0-9]+$/;

/** Known image signatures → (extension, content type). */
interface ImageType {
  ext: string;
  contentType: string;
}

function detectImageType(bytes: Uint8Array): ImageType | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ext: 'png', contentType: 'image/png' };
  }
  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  // GIF: "GIF8"
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return { ext: 'gif', contentType: 'image/gif' };
  }
  return null;
}

export interface StoredImage {
  /** UUID stem, also used as the gallery record id. */
  id: string;
  /**
   * What to persist as the record's `imageFilename`. Filesystem: `<uuid>.<ext>`.
   * Blob: the absolute CDN URL (self-describing, used directly for download).
   */
  filename: string;
  /** Detected from magic bytes. */
  contentType: string;
  /**
   * Public path/URL to fetch the bytes. Filesystem: `/api/images/<file>`.
   * Blob: the absolute CDN URL (loaded directly by the gallery).
   */
  url: string;
}

export class UnsupportedImageError extends Error {
  constructor() {
    super('Unsupported or unrecognized image data');
    this.name = 'UnsupportedImageError';
  }
}

export class InvalidFilenameError extends Error {
  constructor(filename: string) {
    super(`Invalid image filename: ${filename}`);
    this.name = 'InvalidFilenameError';
  }
}

/**
 * Persist image bytes. The content type and extension are derived from the
 * bytes; a caller-supplied id seeds the filename stem (so the gallery row id and
 * the file agree), otherwise a fresh UUID is used.
 *
 * @throws {UnsupportedImageError} when the bytes aren't a recognized image.
 */
export async function saveImage(
  bytes: Uint8Array,
  id: string = randomUUID(),
): Promise<StoredImage> {
  const type = detectImageType(bytes);
  if (!type) throw new UnsupportedImageError();

  const filename = `${id}.${type.ext}`;

  if (blobEnabled()) {
    const { put } = await import('@vercel/blob');
    const result = await put(filename, Buffer.from(bytes), {
      access: 'public',
      addRandomSuffix: false,
      contentType: type.contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN!.trim(),
    });
    // The CDN URL is self-describing: it doubles as the record's filename so
    // download can fetch the bytes back, and as the public URL the gallery loads.
    return {
      id,
      filename: result.url,
      contentType: type.contentType,
      url: result.url,
    };
  }

  const { mkdirSync, writeFileSync, renameSync, rmSync } = await import('node:fs');
  const root = storageRoot();
  mkdirSync(root, { recursive: true });

  const finalPath = join(root, filename);
  // Temp file in the same directory so rename is atomic on one filesystem.
  const tempPath = join(root, `.${id}.${randomUUID()}.tmp`);

  try {
    writeFileSync(tempPath, bytes, { flag: 'wx' });
    renameSync(tempPath, finalPath);
  } catch (err) {
    rmSync(tempPath, { force: true });
    throw err;
  }

  return {
    id,
    filename,
    contentType: type.contentType,
    url: `/api/images/${filename}`,
  };
}

/**
 * Read stored image bytes back. The argument is the record's `imageFilename`:
 *  - An absolute `http(s)` URL (Blob mode) is fetched from the CDN.
 *  - A bare `<uuid>.<ext>` (filesystem mode) is read from disk, guarded against
 *    path traversal: it must match the safe pattern and resolve inside the
 *    storage root.
 *
 * Returns null when the image is absent.
 *
 * @throws {InvalidFilenameError} when a filesystem filename is malformed or
 *   escapes the storage root.
 */
export async function readImage(
  filename: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (/^https?:\/\//i.test(filename)) {
    const res = await fetch(filename);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Blob fetch failed: ${res.status}`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const type = detectImageType(bytes);
    return {
      bytes,
      contentType:
        type?.contentType ??
        res.headers.get('content-type') ??
        'application/octet-stream',
    };
  }

  if (!SAFE_FILENAME.test(filename)) {
    throw new InvalidFilenameError(filename);
  }

  const root = storageRoot();
  const target = resolve(root, filename);
  // Must stay inside the storage root (defense in depth beyond the regex).
  if (target !== join(root, filename) || !target.startsWith(root + '/')) {
    throw new InvalidFilenameError(filename);
  }

  const { readFileSync } = await import('node:fs');
  let bytes: Buffer;
  try {
    bytes = readFileSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const type = detectImageType(bytes);
  return {
    bytes,
    contentType: type?.contentType ?? 'application/octet-stream',
  };
}
