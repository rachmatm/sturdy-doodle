/**
 * Image bytes on the local filesystem (architecture.md §7, §8).
 *
 * Bytes are written under `STORAGE_DIR` (outside `public/`) and served only via
 * `/api/images/[filename]`. Guarantees:
 *  - **Unique IDs** — UUID filename stems, so concurrent generations never
 *    clobber each other.
 *  - **Atomic writes** — temp file + rename on the same directory, so a reader
 *    never observes a half-written image.
 *  - **Magic-byte typing** — the stored extension/content type comes from the
 *    bytes, not a caller-supplied value.
 *  - **Path-traversal guard** — reads validate the filename and resolve it
 *    inside the storage root, rejecting anything that escapes (TC-SEC-002).
 *
 * Server-only: uses `node:fs` and must not be imported by a client component.
 */

import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_STORAGE_DIR = join(process.cwd(), 'storage', 'uploads');

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
  /** `<uuid>.<ext>` on disk. */
  filename: string;
  /** Detected from magic bytes. */
  contentType: string;
  /** Public path to fetch the bytes. */
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
 * Persist image bytes atomically. The content type and extension are derived
 * from the bytes; a caller-supplied id may seed the filename stem (so the
 * gallery row id and the file agree), otherwise a fresh UUID is used.
 *
 * @throws {UnsupportedImageError} when the bytes aren't a recognized image.
 */
export function saveImage(bytes: Uint8Array, id: string = randomUUID()): StoredImage {
  const type = detectImageType(bytes);
  if (!type) throw new UnsupportedImageError();

  const root = storageRoot();
  mkdirSync(root, { recursive: true });

  const filename = `${id}.${type.ext}`;
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
 * Read stored image bytes by filename, guarding against path traversal: the
 * filename must match the safe pattern and resolve to a path inside the storage
 * root. Returns null when the file is absent.
 *
 * @throws {InvalidFilenameError} when the filename is malformed or escapes root.
 */
export function readImage(
  filename: string,
): { bytes: Buffer; contentType: string } | null {
  if (!SAFE_FILENAME.test(filename)) {
    throw new InvalidFilenameError(filename);
  }

  const root = storageRoot();
  const target = resolve(root, filename);
  // Must stay inside the storage root (defense in depth beyond the regex).
  if (target !== join(root, filename) || !target.startsWith(root + '/')) {
    throw new InvalidFilenameError(filename);
  }

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
